import { pieceAreaKm2 } from '../land-area.ts';
import { drawnAs, isInTier, tiers } from '../model.ts';
import { gapKm, neighboursIn } from './borders.ts';
import type { Tier, TieredPlaces } from '../model.ts';
import type { Borders } from './borders.ts';

const mainlandReachKm = 10;

const blockAnchors = { 'Afro-Eurasia': 'EGY', 'the Americas': 'PAN' };

export type NotMainland = { kind: 'island landmass' | 'overseas part' | 'exclave', place: string, land: string };
export type DroppedBorder = { ids: [string, string], reasons: NotMainland[] };
export type TierMainlands = {
  neighbours: Map<string, string[]>
  dropped: DroppedBorder[]
  placesByBlock: Record<string, number>
};

type Landmasses = Borders & { areaKm2: number[], landmassOf: number[], blockOf: Map<number, string> };
type Mainland = { landmass: number, pieces: Set<number> };

export const pairKey = (first: string, second: string) => [first, second].sort().join('-');

const groupsOf = (count: number, links: [number, number][]) => {
  const groupOf = Array.from({ length: count }, (_, index) => index);
  const find = (index: number) => {
    let group = index;
    while (groupOf[group] !== group) group = groupOf[group]!;
    return group;
  };
  for (const [first, second] of links) {
    const [one, other] = [find(first), find(second)];
    groupOf[Math.max(one, other)] = Math.min(one, other);
  }
  return groupOf.map((_, index) => find(index));
};

const landmassesOf = ({ pieces, touching }: Borders): Landmasses => {
  const areaKm2 = pieces.map(({ polygon }) => pieceAreaKm2(polygon));
  const landmassOf = groupsOf(pieces.length, touching);
  const blockOf = new Map(Object.entries(blockAnchors).map(([block, anchor]) => {
    const largest = pieces.reduce((found, { id }, index) =>
      (id === anchor && (found < 0 || areaKm2[index]! > areaKm2[found]!) ? index : found), -1);
    if (largest < 0) throw new Error(`mainland: ${anchor}, which marks ${block}, has no land`);
    return [landmassOf[largest]!, block];
  }));
  return { pieces, touching, areaKm2, landmassOf, blockOf };
};

const countsTowardIn = ({ pieces }: Landmasses, places: TieredPlaces, tier: Tier) =>
  pieces.map(({ id, unclaimed }) => {
    const place = places[id];
    if (unclaimed || !place) return undefined;
    if (isInTier(place.tier, tier)) return id;
    // Dependency land never counts toward its holder's mainland; breakaway land does.
    return place.tier === 'dependencies' ? undefined : drawnAs(places, id, tier);
  });

// Touching pieces of one place count as one piece, as they would in the tier's dissolved map.
const mainlandsOf = (landmasses: Landmasses, countsToward: (string | undefined)[]) => {
  const { pieces, touching, areaKm2, landmassOf, blockOf } = landmasses;
  const clusterOf = groupsOf(pieces.length, touching.filter(([first, second]) =>
    countsToward[first] !== undefined && countsToward[first] === countsToward[second]));
  const clustersByPlace = new Map<string, Map<number, number[]>>();
  countsToward.forEach((id, index) => {
    if (id === undefined || !blockOf.has(landmassOf[index]!)) return;
    const clusters = clustersByPlace.get(id) ?? new Map<number, number[]>();
    clusters.set(clusterOf[index]!, [...(clusters.get(clusterOf[index]!) ?? []), index]);
    clustersByPlace.set(id, clusters);
  });
  const sizeKm2 = (cluster: number[]) => cluster.reduce((sum, index) => sum + areaKm2[index]!, 0);
  const clusterGapKm = (cluster: number[], other: number[]) => Math.min(...cluster.flatMap(index => other.flatMap(
    otherIndex => pieces[index]!.polygon.flatMap(ring => pieces[otherIndex]!.polygon.map(otherRing => gapKm(ring, otherRing))),
  )));
  return new Map([...clustersByPlace].map(([id, clusters]): [string, Mainland] => {
    const [largest = [], ...others] = [...clusters.values()].sort((first, second) => sizeKm2(second) - sizeKm2(first));
    const landmass = landmassOf[largest[0]!]!;
    const near = others.filter(cluster =>
      landmassOf[cluster[0]!] === landmass && clusterGapKm(cluster, largest) <= mainlandReachKm);
    return [id, { landmass, pieces: new Set([largest, ...near].flat()) }];
  }));
};

const pairsOf = (neighbours: Map<string, string[]>) =>
  [...neighbours].flatMap(([id, others]) => others.filter(other => id < other).map(other => pairKey(id, other)));

const neighbourMap = (pairs: Iterable<string>) => {
  const neighbours = new Map<string, string[]>();
  for (const pair of [...pairs].sort()) {
    const [first, second] = pair.split('-') as [string, string];
    neighbours.set(first, [...neighbours.get(first) ?? [], second]);
    neighbours.set(second, [...neighbours.get(second) ?? [], first]);
  }
  return new Map([...neighbours].map(([id, others]) => [id, others.sort()]));
};

type TierInput = { places: TieredPlaces, tier: Tier, tierBorders: Borders };

const tierMainlands = (landmasses: Landmasses, { places, tier, tierBorders }: TierInput): TierMainlands => {
  const { pieces, touching, landmassOf, blockOf } = landmasses;
  const countsToward = countsTowardIn(landmasses, places, tier);
  const mainlands = mainlandsOf(landmasses, countsToward);
  const isMainland = (index: number) => {
    const id = countsToward[index];
    return id !== undefined && mainlands.get(id)?.pieces.has(index) === true;
  };

  const mainlandPairs = new Set(touching
    .filter(([first, second]) => countsToward[first] !== countsToward[second] && isMainland(first) && isMainland(second))
    .map(([first, second]) => pairKey(countsToward[first]!, countsToward[second]!)));
  const neighbourPairs = new Set(pairsOf(neighboursIn(tierBorders)));
  const notNeighbours = [...mainlandPairs].filter(pair => !neighbourPairs.has(pair));
  if (notNeighbours.length) throw new Error(`mainland: ${tier}: ${notNeighbours.join(', ')} are mainland neighbours but not neighbours`);

  const drawnIn = pieces.map(({ id, unclaimed }) => (unclaimed ? undefined : drawnAs(places, id, tier)));
  const whyNotMainland = (index: number): NotMainland[] => {
    if (isMainland(index)) return [];
    const where = { place: drawnIn[index]!, land: pieces[index]!.id };
    if (!blockOf.has(landmassOf[index]!)) return [{ kind: 'island landmass', ...where }];
    const mainland = countsToward[index] === undefined ? undefined : mainlands.get(where.place);
    return [{ kind: mainland?.landmass === landmassOf[index] ? 'exclave' : 'overseas part', ...where }];
  };
  const reasonsByPair = new Map<string, NotMainland[]>();
  for (const [first, second] of touching) {
    if (!drawnIn[first] || !drawnIn[second] || drawnIn[first] === drawnIn[second]) continue;
    const pair = pairKey(drawnIn[first], drawnIn[second]);
    reasonsByPair.set(pair, [...reasonsByPair.get(pair) ?? [], ...whyNotMainland(first), ...whyNotMainland(second)]);
  }
  const dropped = [...neighbourPairs].filter(pair => !mainlandPairs.has(pair)).sort().map(pair => ({
    ids: pair.split('-') as [string, string],
    reasons: [...new Map((reasonsByPair.get(pair) ?? []).map(reason => [JSON.stringify(reason), reason])).values()],
  }));

  const placesByBlock: Record<string, number> = Object.fromEntries(Object.keys(blockAnchors).map(block => [block, 0]));
  for (const { landmass } of mainlands.values()) {
    const block = blockOf.get(landmass)!;
    placesByBlock[block] = (placesByBlock[block] ?? 0) + 1;
  }
  return { neighbours: neighbourMap(mainlandPairs), dropped, placesByBlock };
};

// Mainlands come from the dependencies map relabelled per tier, because the tier's own map has already dissolved
// dependency land into its holder.
export const mainlandsByTier = (borders: Record<Tier, Borders>, places: TieredPlaces) => {
  const landmasses = landmassesOf(borders.dependencies);
  return Object.fromEntries(tiers.map(tier =>
    [tier, tierMainlands(landmasses, { places, tier, tierBorders: borders[tier] })])) as Record<Tier, TierMainlands>;
};
