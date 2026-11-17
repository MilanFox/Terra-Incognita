import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pieceAreaKm2 } from '../land-area.ts';
import { byId, polygonsOf, tiers } from '../model.ts';
import { curatedDir } from '../paths.ts';
import { bboxOf } from './compute.ts';
import type { Bbox, Ring, Tier, TieredPlaces } from '../model.ts';
import type { TierMaps } from './dissolve.ts';

export type ChainOutline = { id: string, tier: Tier, group?: string, ring: Ring };
export type ChainRulings = {
  keep: Record<string, string>
  drop: Record<string, string>
  groups: Record<string, { name: string, bbox: Bbox }[]>
};
export type Chains = {
  outlines: ChainOutline[]
  idsByTier: Record<Tier, string[]>
  staleRulings: string[]
  overlaps: string[]
};

export const chainMinBboxRatio = 10;
export const chainMaxLargestPieceKm2 = 6000;

const earthRadiusKm = 6371.0088;
const radians = Math.PI / 180;
const paddingDegrees = 0.4;
const startingRoundness = 0.35;
const roundnessStep = 0.05;
const maxRoundnessPasses = 8;
const roundedCornerSteps = 24;
const smoothingIterations = 3;

export const readChainRulings = (): ChainRulings =>
  JSON.parse(readFileSync(resolve(curatedDir, 'chains.json'), 'utf8'));

const bboxAreaKm2 = ([west, south, east, north]: Bbox) =>
  earthRadiusKm ** 2 * ((east >= west ? east - west : east + 360 - west) * radians) * (Math.sin(north * radians) - Math.sin(south * radians));

const convexHull = (points: [number, number][]) => {
  const sorted = [...points].sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  const cross = (origin: [number, number], first: [number, number], second: [number, number]) =>
    (first[0] - origin[0]) * (second[1] - origin[1]) - (first[1] - origin[1]) * (second[0] - origin[0]);
  const halfHull = (list: [number, number][]) => {
    const half: [number, number][] = [];
    for (const point of list) {
      while (half.length >= 2 && cross(half[half.length - 2]!, half[half.length - 1]!, point) <= 0) half.pop();
      half.push(point);
    }
    half.pop();
    return half;
  };
  return [...halfHull(sorted), ...halfHull([...sorted].reverse())];
};

const chaikin = (ring: Ring, iterations: number): Ring => iterations === 0
  ? ring
  : chaikin(ring.flatMap((point, index) => {
      const next = ring[(index + 1) % ring.length]!;
      return [
        [0.75 * point[0] + 0.25 * next[0], 0.75 * point[1] + 0.25 * next[1]],
        [0.25 * point[0] + 0.75 * next[0], 0.25 * point[1] + 0.75 * next[1]],
      ] as Ring;
    }), iterations - 1);

// The hull with a circle around every corner, so its corners are rounded. The radius grows with the chain's narrow
// side, which makes the outline read as a blob rather than a polygon.
const roundedOutline = (hull: Ring, roundness: number): Ring => {
  const longitudes = hull.map(([longitude]) => longitude);
  const latitudes = hull.map(([, latitude]) => latitude);
  const narrowSide = Math.min(
    Math.max(...longitudes) - Math.min(...longitudes),
    Math.max(...latitudes) - Math.min(...latitudes),
  );
  const radius = Math.max(paddingDegrees, narrowSide * roundness);
  const padded = convexHull(hull.flatMap(([longitude, latitude]) => Array.from({ length: roundedCornerSteps }, (_, step) => {
    const angle = step * 2 * Math.PI / roundedCornerSteps;
    return [longitude + radius * Math.cos(angle), latitude + radius * Math.sin(angle)] as [number, number];
  })));
  return chaikin(padded, smoothingIterations);
};

// Both rings are convex, so they overlap unless the normal of one of their edges separates them.
const convexRingsOverlap = (first: Ring, second: Ring) => [first, second].every(ring => ring.every((point, index) => {
  const next = ring[(index + 1) % ring.length]!;
  const axis = [next[1] - point[1], point[0] - next[0]] as const;
  const project = (other: Ring) => other.map(([longitude, latitude]) => longitude * axis[0] + latitude * axis[1]);
  const [firstProjection, secondProjection] = [project(first), project(second)];
  return Math.max(...firstProjection) > Math.min(...secondProjection)
    && Math.max(...secondProjection) > Math.min(...firstProjection);
}));

const meanPoint = ([outer = []]: Ring[]) => [
  outer.reduce((sum, [longitude]) => sum + longitude, 0) / outer.length,
  outer.reduce((sum, [, latitude]) => sum + latitude, 0) / outer.length,
] as const;

type Candidate = { id: string, tier: Tier, group?: string, hull: Ring, roundness: number, ring: Ring };

const hullOf = (id: string, polygons: Ring[][]) => {
  const vertices = polygons.flatMap(([outer = []]) => outer);
  const longitudes = vertices.map(([longitude]) => longitude);
  if (Math.max(...longitudes) - Math.min(...longitudes) > 180) {
    throw new Error(`chains: ${id} crosses the antimeridian; split it into groups in chains.json`);
  }
  return convexHull(vertices);
};

const groupsOf = (id: string, polygons: Ring[][], { groups }: ChainRulings) => {
  const splits = groups[id];
  if (!splits) return [{ group: undefined, polygons }];
  const byGroup = splits.map(({ name, bbox: [west, south, east, north] }) => ({
    group: name,
    polygons: polygons.filter((polygon) => {
      const [longitude, latitude] = meanPoint(polygon);
      return longitude >= west && longitude < east && latitude >= south && latitude < north;
    }),
  }));
  if (byGroup.reduce((sum, { polygons: inGroup }) => sum + inGroup.length, 0) !== polygons.length) {
    throw new Error(`chains: the groups of ${id} in chains.json don't cover each of its pieces exactly once`);
  }
  // A group of one island has nothing to enclose.
  return byGroup.filter(({ polygons: inGroup }) => inGroup.length >= 2);
};

export const chainsOf = (maps: TierMaps, places: TieredPlaces, rulings: ChainRulings): Chains => {
  const candidates: Candidate[] = [];
  const idsByTier = { sovereign: [], defacto: [], dependencies: [] } as Record<Tier, string[]>;
  const staleRulings: string[] = [];
  const ruleHits = new Set<string>();
  for (const tier of tiers) {
    for (const { properties: { id, unclaimed }, geometry } of maps[tier].features) {
      if (unclaimed || places[id]?.tier !== tier) continue;
      const polygons = polygonsOf(geometry);
      const bbox = bboxOf(geometry);
      const landKm2 = polygons.reduce((sum, polygon) => sum + pieceAreaKm2(polygon), 0);
      const largestKm2 = Math.max(...polygons.map(polygon => pieceAreaKm2(polygon)));
      const isRuleHit = polygons.length >= 2 && bbox !== undefined
        && bboxAreaKm2(bbox) > chainMinBboxRatio * landKm2 && largestKm2 < chainMaxLargestPieceKm2;
      if (isRuleHit) ruleHits.add(id);
      if (rulings.keep[id] && polygons.length < 2) staleRulings.push(`keep ${id}: fewer than two pieces in the ${tier} map`);
      const isChain = (isRuleHit && !rulings.drop[id]) || (rulings.keep[id] !== undefined && polygons.length >= 2);
      if (!isChain) continue;
      idsByTier[tier].push(id);
      for (const { group, polygons: inGroup } of groupsOf(id, polygons, rulings)) {
        const hull = hullOf(id, inGroup);
        candidates.push({ id, tier, ...(group && { group }), hull, roundness: startingRoundness, ring: roundedOutline(hull, startingRoundness) });
      }
    }
  }
  for (const id of Object.keys(rulings.drop).filter(dropped => !ruleHits.has(dropped))) {
    staleRulings.push(`drop ${id}: not a chain by the rule`);
  }

  const clashingCandidates = () => new Set(candidates.flatMap((candidate, index) => candidates.slice(index + 1)
    .filter(other => convexRingsOverlap(candidate.ring, other.ring))
    .flatMap(other => [candidate, other])));
  // Overlapping outlines get less round, step by step, until they clear; at roundness 0 only the padding is left.
  for (let pass = 0; pass < maxRoundnessPasses; pass++) {
    const clashing = clashingCandidates();
    if (!clashing.size) break;
    for (const candidate of clashing) {
      candidate.roundness = Math.max(0, candidate.roundness - roundnessStep);
      candidate.ring = roundedOutline(candidate.hull, candidate.roundness);
    }
  }
  const overlaps = candidates.flatMap((candidate, index) => candidates.slice(index + 1)
    .filter(other => convexRingsOverlap(candidate.ring, other.ring))
    .map(other => [candidate.id, other.id].sort().join('-')));

  const outlines = candidates
    .map(({ id, tier, group, ring }): ChainOutline => {
      const rounded = ring.map(([longitude, latitude]) => [Math.round(longitude * 1000) / 1000, Math.round(latitude * 1000) / 1000] as [number, number]);
      return { id, tier, ...(group && { group }), ring: [...rounded, rounded[0]!] };
    })
    .sort((first, second) => byId(first, second) || (first.group ?? '').localeCompare(second.group ?? ''));
  return { outlines, idsByTier, staleRulings, overlaps: [...new Set(overlaps)].sort() };
};

export const chainOutlinesText = (outlines: ChainOutline[]) => {
  const features = outlines.map(({ id, tier, group, ring }) => ({
    type: 'Feature',
    properties: { id, tier, ...(group && { group }) },
    geometry: { type: 'Polygon', coordinates: [ring] },
  }));
  return `{"type":"FeatureCollection","features":[\n${features.map(feature => JSON.stringify(feature)).join(',\n')}\n]}\n`;
};
