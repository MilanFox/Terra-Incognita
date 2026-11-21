import type { Ring } from './model.ts';

export type Point = [number, number];
type Grid = { columns: number, rows: number, west: number, south: number };

const cellDegrees = 0.05;
const simplifyToleranceDegrees = 0.03;
const unreached = 1e20;

// Felzenszwalb and Huttenlocher's distance transform: per cell the squared distance, in cells, to the nearest seed.
const squaredDistances = (isSeed: Uint8Array, { columns, rows }: Grid) => {
  const distances = Float64Array.from(isSeed, seed => (seed ? 0 : unreached));
  const longest = Math.max(columns, rows);
  const line = new Float64Array(longest);
  const parabolas = new Int32Array(longest);
  const envelopeEnds = new Float64Array(longest + 1);
  const meetingOf = (cell: number, parabola: number) =>
    (line[cell]! + cell * cell - line[parabola]! - parabola * parabola) / (2 * cell - 2 * parabola);
  const transformLine = (start: number, stride: number, length: number) => {
    for (let cell = 0; cell < length; cell++) line[cell] = distances[start + cell * stride]!;
    let last = 0;
    parabolas[0] = 0;
    envelopeEnds[0] = -Infinity;
    envelopeEnds[1] = Infinity;
    for (let cell = 1; cell < length; cell++) {
      let meeting = meetingOf(cell, parabolas[last]!);
      while (meeting <= envelopeEnds[last]!) meeting = meetingOf(cell, parabolas[--last]!);
      parabolas[++last] = cell;
      envelopeEnds[last] = meeting;
      envelopeEnds[last + 1] = Infinity;
    }
    last = 0;
    for (let cell = 0; cell < length; cell++) {
      while (envelopeEnds[last + 1]! < cell) last++;
      const parabola = parabolas[last]!;
      distances[start + cell * stride] = (cell - parabola) ** 2 + line[parabola]!;
    }
  };
  for (let column = 0; column < columns; column++) transformLine(column, columns, rows);
  for (let row = 0; row < rows; row++) transformLine(row * columns, 1, columns);
  return distances;
};

type Link = { length: number, ends: Ring };

const closestLink = (island: Ring, other: Ring) => {
  let link: Link = { length: Infinity, ends: [] };
  for (const from of island) {
    for (const to of other) {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (length < link.length) link = { length, ends: [from, to] };
    }
  }
  return link;
};

// The shortest set of links that joins all islands into one piece (a minimum spanning tree, grown island by island).
const spineOf = ([first = [], ...others]: Ring[]) => {
  let waiting = others.map(island => ({ island, link: closestLink(first, island) }));
  const spine: Ring[] = [];
  while (waiting.length) {
    const next = waiting.reduce((nearest, entry) => (entry.link.length < nearest.link.length ? entry : nearest));
    spine.push(next.link.ends);
    waiting = waiting.filter(entry => entry !== next).map((entry) => {
      const link = closestLink(next.island, entry.island);
      return link.length < entry.link.length ? { ...entry, link } : entry;
    });
  }
  return spine;
};

const coastCells = (islands: Ring[], grid: Grid) => {
  const isCoast = new Uint8Array(grid.columns * grid.rows);
  const mark = (longitude: number, latitude: number) => {
    isCoast[Math.round((latitude - grid.south) / cellDegrees) * grid.columns + Math.round((longitude - grid.west) / cellDegrees)] = 1;
  };
  for (const island of islands) {
    island.forEach(([fromLon, fromLat], index) => {
      const [toLon, toLat] = island[(index + 1) % island.length]!;
      const steps = Math.ceil(Math.hypot(toLon - fromLon, toLat - fromLat) / (cellDegrees / 2)) || 1;
      for (let step = 0; step < steps; step++) mark(fromLon + (toLon - fromLon) * step / steps, fromLat + (toLat - fromLat) * step / steps);
    });
  }
  return isCoast;
};

// Marching squares. Each segment runs with the inside on its left, from one cell edge to another, so the land side
// of a ring is known from its turning direction. A cell edge is numbered by its lower-left node and its direction.
const contoursOf = (field: Float64Array, grid: Grid) => {
  const { columns, rows } = grid;
  const horizontal = (column: number, row: number) => 2 * (row * columns + column);
  const vertical = (column: number, row: number) => 2 * (row * columns + column) + 1;
  const nextEdge = new Map<number, number>();
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const node = row * columns + column;
      const corners = (field[node]! > 0 ? 1 : 0) + (field[node + 1]! > 0 ? 2 : 0)
        + (field[node + columns + 1]! > 0 ? 4 : 0) + (field[node + columns]! > 0 ? 8 : 0);
      if (corners === 0 || corners === 15) continue;
      const [bottom, right, top, left] = [horizontal(column, row), vertical(column + 1, row), horizontal(column, row + 1), vertical(column, row)];
      const segments: [number, number][] = [
        [], [[bottom, left]], [[right, bottom]], [[right, left]], [[top, right]], [[bottom, left], [top, right]], [[top, bottom]], [[top, left]],
        [[left, top]], [[bottom, top]], [[right, bottom], [left, top]], [[right, top]], [[left, right]], [[bottom, right]], [[left, bottom]],
      ][corners] as [number, number][];
      for (const [from, to] of segments) nextEdge.set(from, to);
    }
  }
  const pointOn = (edge: number): Point => {
    const node = edge >> 1;
    const neighbour = node + (edge % 2 ? columns : 1);
    const along = field[node]! / (field[node]! - field[neighbour]!);
    const [column, row] = [node % columns + (edge % 2 ? 0 : along), Math.floor(node / columns) + (edge % 2 ? along : 0)];
    return [grid.west + column * cellDegrees, grid.south + row * cellDegrees];
  };
  const rings: Ring[] = [];
  while (nextEdge.size) {
    const ring: Ring = [];
    let [edge] = nextEdge.keys() as unknown as [number | undefined];
    while (edge !== undefined && nextEdge.has(edge)) {
      ring.push(pointOn(edge));
      const following: number = nextEdge.get(edge)!;
      nextEdge.delete(edge);
      edge = following;
    }
    rings.push(ring);
  }
  return rings;
};

const signedArea = (ring: Ring) => ring.reduce((sum, [longitude, latitude], index) => {
  const [nextLongitude, nextLatitude] = ring[(index + 1) % ring.length]!;
  return sum + longitude * nextLatitude - nextLongitude * latitude;
}, 0) / 2;

const distanceToSegment = ([longitude, latitude]: Point, [fromLon, fromLat]: Point, [toLon, toLat]: Point) => {
  const [alongLon, alongLat] = [toLon - fromLon, toLat - fromLat];
  const lengthSquared = alongLon ** 2 + alongLat ** 2 || 1;
  const along = Math.max(0, Math.min(1, ((longitude - fromLon) * alongLon + (latitude - fromLat) * alongLat) / lengthSquared));
  return Math.hypot(longitude - fromLon - along * alongLon, latitude - fromLat - along * alongLat);
};

// Douglas and Peucker, on the ring cut in two at its first point and the point furthest from it.
const simplified = (ring: Ring) => {
  const [first] = ring as [Point];
  const furthest = ring.reduce((best, [longitude, latitude], index) =>
    Math.hypot(longitude - first[0], latitude - first[1]) > Math.hypot(ring[best]![0] - first[0], ring[best]![1] - first[1]) ? index : best, 0);
  const isKept = new Uint8Array(ring.length + 1);
  const open = [...ring, first];
  const spans: [number, number][] = [[0, furthest], [furthest, ring.length]];
  isKept[0] = isKept[furthest] = 1;
  while (spans.length) {
    const [from, to] = spans.pop()!;
    let [widest, widestDistance] = [from, simplifyToleranceDegrees];
    for (let index = from + 1; index < to; index++) {
      const distance = distanceToSegment(open[index]!, open[from]!, open[to]!);
      if (distance > widestDistance) [widest, widestDistance] = [index, distance];
    }
    if (widest === from) continue;
    isKept[widest] = 1;
    spans.push([from, widest], [widest, to]);
  }
  return ring.filter((_, index) => isKept[index]);
};

// The outline a ball of rollingRadius leaves when it rolls around the islands and the links between them, pushed out
// by padding. A large ball leaves nearly the convex hull; a small one follows the islands and their links closely.
export const fittedOutline = (islands: Ring[], rollingRadius: number, padding: number): Ring => {
  const vertices = islands.flat();
  const margin = rollingRadius + padding + 3 * cellDegrees;
  const west = Math.min(...vertices.map(([longitude]) => longitude)) - margin;
  const south = Math.min(...vertices.map(([, latitude]) => latitude)) - margin;
  const grid: Grid = {
    columns: Math.ceil((Math.max(...vertices.map(([longitude]) => longitude)) + margin - west) / cellDegrees) + 1,
    rows: Math.ceil((Math.max(...vertices.map(([, latitude]) => latitude)) + margin - south) / cellDegrees) + 1,
    west,
    south,
  };
  const clearanceCells = (rollingRadius + padding) / cellDegrees;
  const fromCoast = squaredDistances(coastCells([...islands, ...spineOf(islands)], grid), grid);
  const fromBall = squaredDistances(Uint8Array.from(fromCoast, distance => (distance > clearanceCells ** 2 ? 1 : 0)), grid);
  const insideBy = fromBall.map(distance => Math.sqrt(distance) - rollingRadius / cellDegrees);
  const [outer = []] = contoursOf(insideBy, grid).sort((first, second) => signedArea(second) - signedArea(first));
  return simplified(outer);
};
