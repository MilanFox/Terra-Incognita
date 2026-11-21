import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pieceAreaKm2 } from '../land-area.ts';
import { byId, polygonsOf, tiers } from '../model.ts';
import { curatedDir } from '../paths.ts';
import { bboxOf } from './compute.ts';
import { fittedOutline } from '../fitted-outline.ts';
import type { Point } from '../fitted-outline.ts';
import type { Bbox, Ring, Tier, TieredPlaces } from '../model.ts';
import type { TierMaps } from './dissolve.ts';

export type ChainOutline = { id: string, tier: Tier, ring: Ring };
export type ChainRulings = {
  keep: Record<string, string>
  drop: Record<string, string>
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
const fittedSmoothingIterations = 2;
const rollingRadiusStep = 0.7;

export const readChainRulings = (): ChainRulings =>
  JSON.parse(readFileSync(resolve(curatedDir, 'chains.json'), 'utf8'));

const bboxAreaKm2 = ([west, south, east, north]: Bbox) =>
  earthRadiusKm ** 2 * ((east >= west ? east - west : east + 360 - west) * radians) * (Math.sin(north * radians) - Math.sin(south * radians));

const convexHull = (points: Point[]) => {
  const sorted = [...points].sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  const cross = (origin: Point, first: Point, second: Point) =>
    (first[0] - origin[0]) * (second[1] - origin[1]) - (first[1] - origin[1]) * (second[0] - origin[0]);
  const halfHull = (list: Point[]) => {
    const half: Point[] = [];
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
    return [longitude + radius * Math.cos(angle), latitude + radius * Math.sin(angle)] as Point;
  })));
  return chaikin(padded, smoothingIterations);
};

const crosses = ([from, to]: [Point, Point], [otherFrom, otherTo]: [Point, Point]) => {
  const sideOf = (start: Point, end: Point, point: Point) =>
    Math.sign((end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]));
  return sideOf(from, to, otherFrom) !== sideOf(from, to, otherTo) && sideOf(otherFrom, otherTo, from) !== sideOf(otherFrom, otherTo, to);
};

const contains = (ring: Ring, [longitude, latitude]: Point) => ring.reduce((isInside, [fromLon, fromLat], index) => {
  const [toLon, toLat] = ring[(index + 1) % ring.length]!;
  const isCrossed = (fromLat > latitude) !== (toLat > latitude)
    && longitude < fromLon + (latitude - fromLat) / (toLat - fromLat) * (toLon - fromLon);
  return isCrossed ? !isInside : isInside;
}, false);

const extentOf = (ring: Ring) => {
  const longitudes = ring.map(([longitude]) => longitude);
  const latitudes = ring.map(([, latitude]) => latitude);
  return { west: Math.min(...longitudes), south: Math.min(...latitudes), east: Math.max(...longitudes), north: Math.max(...latitudes) };
};

const ringsOverlapAsDrawn = (first: Ring, second: Ring) => {
  const [firstExtent, secondExtent] = [extentOf(first), extentOf(second)];
  if (firstExtent.west > secondExtent.east || secondExtent.west > firstExtent.east
    || firstExtent.south > secondExtent.north || secondExtent.south > firstExtent.north) return false;
  return contains(first, second[0]!) || contains(second, first[0]!)
    || first.some((point, index) => second.some((other, otherIndex) =>
      crosses([point, first[(index + 1) % first.length]!], [other, second[(otherIndex + 1) % second.length]!])));
};

// The map repeats sideways, so two outlines also overlap when they meet a full turn apart.
const ringsOverlap = (first: Ring, second: Ring) => [-360, 0, 360].some(turn =>
  ringsOverlapAsDrawn(first, second.map(([longitude, latitude]): Point => [longitude + turn, latitude])));

type Candidate = { id: string, tier: Tier, islands: Ring[], hull: Ring, roundness: number, ring: Ring, isFitted: boolean };

const longSideOf = ({ hull }: Candidate) => {
  const { west, south, east, north } = extentOf(hull);
  return Math.max(east - west, north - south);
};

// The ball starts as wide as the chain is long, which leaves nearly the convex hull, and shrinks until the outline is
// clear of the others or as tight as the padding lets it get.
const fitCloser = (candidate: Candidate, isClashing: () => boolean) => {
  for (let rollingRadius = longSideOf(candidate); rollingRadius >= paddingDegrees; rollingRadius *= rollingRadiusStep) {
    candidate.ring = chaikin(fittedOutline(candidate.islands, rollingRadius, paddingDegrees), fittedSmoothingIterations);
    candidate.isFitted = true;
    if (!isClashing()) return;
  }
};

// A bbox that crosses the antimeridian has west > east; the land east of the line then moves a turn further east,
// so the chain is one run of longitudes.
const unbrokenOuterRings = (polygons: Ring[][], [west, , east]: Bbox): Ring[] => polygons.map(([outer = []]) =>
  outer.map(([longitude, latitude]): Point => [west > east && longitude < west ? longitude + 360 : longitude, latitude]));

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
      if (!isChain || !bbox) continue;
      idsByTier[tier].push(id);
      const islands = unbrokenOuterRings(polygons, bbox);
      const hull = convexHull(islands.flat());
      candidates.push({ id, tier, islands, hull, roundness: 0, ring: roundedOutline(hull, 0), isFitted: false });
    }
  }
  for (const id of Object.keys(rulings.drop).filter(dropped => !ruleHits.has(dropped))) {
    staleRulings.push(`drop ${id}: not a chain by the rule`);
  }

  const isClashing = (candidate: Candidate) => candidates.some(other => other !== candidate && ringsOverlap(candidate.ring, other.ring));
  // A chain whose convex outline overlaps another even with the least padding gets a closer-fitting one, the longest
  // chain first, so a small chain inside a long one's hull keeps its convex outline.
  for (const candidate of [...candidates].sort((first, second) => longSideOf(second) - longSideOf(first))) {
    if (isClashing(candidate)) fitCloser(candidate, () => isClashing(candidate));
  }
  const convexCandidates = candidates.filter(({ isFitted }) => !isFitted);
  for (const candidate of convexCandidates) {
    candidate.roundness = startingRoundness;
    candidate.ring = roundedOutline(candidate.hull, startingRoundness);
  }
  // Overlapping outlines get less round, step by step, until they clear; at roundness 0 only the padding is left.
  for (let pass = 0; pass < maxRoundnessPasses; pass++) {
    const clashing = convexCandidates.filter(isClashing);
    if (!clashing.length) break;
    for (const candidate of clashing) {
      candidate.roundness = Math.max(0, candidate.roundness - roundnessStep);
      candidate.ring = roundedOutline(candidate.hull, candidate.roundness);
    }
  }
  const overlaps = candidates.flatMap((candidate, index) => candidates.slice(index + 1)
    .filter(other => ringsOverlap(candidate.ring, other.ring))
    .map(other => [candidate.id, other.id].sort().join('-')));

  const outlines = candidates
    .map(({ id, tier, ring }): ChainOutline => {
      const rounded = ring.map(([longitude, latitude]) => [Math.round(longitude * 1000) / 1000, Math.round(latitude * 1000) / 1000] as Point);
      return { id, tier, ring: [...rounded, rounded[0]!] };
    })
    .sort(byId);
  return { outlines, idsByTier, staleRulings, overlaps: [...new Set(overlaps)].sort() };
};

export const chainOutlinesText = (outlines: ChainOutline[]) => {
  const features = outlines.map(({ id, tier, ring }) => ({
    type: 'Feature',
    properties: { id, tier },
    geometry: { type: 'Polygon', coordinates: [ring] },
  }));
  return `{"type":"FeatureCollection","features":[\n${features.map(feature => JSON.stringify(feature)).join(',\n')}\n]}\n`;
};
