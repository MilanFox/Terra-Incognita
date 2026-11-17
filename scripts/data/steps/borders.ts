import { polygonsOf, tiers } from '../model.ts';
import type { Land, Ring, Tier } from '../model.ts';
import type { TierMaps } from './dissolve.ts';

type Point = [number, number];

export type Piece = { id: string, unclaimed: boolean, polygon: Ring[] };
export type Borders = { pieces: Piece[], touching: [number, number][] };

// Macao and China share a land border, but NE 10m leaves a gap between them (about 650 m in the raw data, 90 m after
// simplifying). The gap is bridged in every map that draws both, and the build stops if it ever grows beyond maxKm.
const bridgedGaps = [{ ids: ['CHN', 'MAC'], maxKm: 1 }] as const;

const kmPerDegree = 6371.0088 * Math.PI / 180;

const piecesOf = (map: Land): Piece[] => map.features.flatMap(({ properties: { id, unclaimed }, geometry }) =>
  polygonsOf(geometry).map(polygon => ({ id, unclaimed: unclaimed === true, polygon })));

const segmentKey = (from: Point, to: Point) => {
  const [first, second] = [from.join(), to.join()].sort();
  return `${first} ${second}`;
};

const sharedSegmentPairs = (pieces: Piece[]) => {
  const piecesBySegment = new Map<string, number[]>();
  pieces.forEach(({ polygon }, pieceIndex) => {
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index++) {
        const [from, to] = [ring[index - 1]!, ring[index]!];
        // A repeated vertex would turn a point touch (Namibia–Zimbabwe, Zambia–Botswana) into a shared border.
        if (from[0] === to[0] && from[1] === to[1]) continue;
        const key = segmentKey(from, to);
        const owners = piecesBySegment.get(key) ?? [];
        if (!owners.includes(pieceIndex)) piecesBySegment.set(key, [...owners, pieceIndex]);
      }
    }
  });
  const pairs: [number, number][] = [];
  for (const owners of piecesBySegment.values()) {
    owners.forEach((first, index) => owners.slice(index + 1).forEach(second => pairs.push([first, second])));
  }
  return pairs;
};

const distanceToEdgeKm = (point: Point, from: Point, to: Point) => {
  const xScale = Math.cos(point[1] * Math.PI / 180);
  const [ax, ay] = [(from[0] - point[0]) * xScale, from[1] - point[1]];
  const [dx, dy] = [(to[0] - from[0]) * xScale, to[1] - from[1]];
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
  return Math.hypot(ax + along * dx, ay + along * dy) * kmPerDegree;
};

const vertexToEdgesKm = (vertices: Ring, edges: Ring) => vertices.reduce((nearest, vertex) => edges.reduce(
  (nearestToVertex, to, index) => (index ? Math.min(nearestToVertex, distanceToEdgeKm(vertex, edges[index - 1]!, to)) : nearestToVertex),
  nearest,
), Infinity);

export const gapKm = (first: Ring, second: Ring) => Math.min(vertexToEdgesKm(first, second), vertexToEdgesKm(second, first));

const bridge = (pieces: Piece[], { ids: [firstId, secondId], maxKm }: typeof bridgedGaps[number]) => {
  const indicesOf = (id: string) => pieces.flatMap((piece, index) => (piece.id === id ? [index] : []));
  let nearest: { km: number, pair: [number, number] } | undefined;
  for (const first of indicesOf(firstId)) {
    for (const second of indicesOf(secondId)) {
      const km = gapKm(pieces[first]!.polygon[0] ?? [], pieces[second]!.polygon[0] ?? []);
      if (!nearest || km < nearest.km) nearest = { km, pair: [Math.min(first, second), Math.max(first, second)] };
    }
  }
  if (nearest && nearest.km > maxKm) {
    throw new Error(`borders: ${firstId} and ${secondId} are ${nearest.km.toFixed(2)} km apart, more than the ${maxKm} km bridged`);
  }
  return nearest?.pair;
};

export const bordersOf = (map: Land): Borders => {
  const pieces = piecesOf(map);
  const bridges = bridgedGaps.flatMap((gap) => {
    const pair = bridge(pieces, gap);
    return pair ? [pair] : [];
  });
  const pairKeys = new Set([...sharedSegmentPairs(pieces), ...bridges].map(([first, second]) => first * pieces.length + second));
  const touching = [...pairKeys]
    .sort((first, second) => first - second)
    .map((key): [number, number] => [Math.floor(key / pieces.length), key % pieces.length]);
  return { pieces, touching };
};

export const bordersByTier = (maps: TierMaps) =>
  Object.fromEntries(tiers.map(tier => [tier, bordersOf(maps[tier])])) as Record<Tier, Borders>;

export const neighboursIn = ({ pieces, touching }: Borders) => {
  const neighbours = new Map<string, Set<string>>();
  const link = (id: string, other: string) => neighbours.set(id, (neighbours.get(id) ?? new Set()).add(other));
  for (const [first, second] of touching) {
    const [one, other] = [pieces[first]!, pieces[second]!];
    if (one.id === other.id || one.unclaimed || other.unclaimed) continue;
    link(one.id, other.id);
    link(other.id, one.id);
  }
  return new Map([...neighbours].map(([id, ids]) => [id, [...ids].sort()]));
};
