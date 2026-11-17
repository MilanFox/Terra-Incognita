import { polygonsOf } from '../model.ts';
import type { Bbox, Geometry, Land } from '../model.ts';

export type PlaceFacts = { bbox: Bbox };

type Range = { min: number, max: number };

const rangeOf = (values: number[]): Range => values.reduce(
  (range, value) => ({ min: Math.min(range.min, value), max: Math.max(range.max, value) }),
  { min: Infinity, max: -Infinity },
);

const mergedRanges = (ranges: Range[]) => {
  const merged: Range[] = [];
  for (const range of [...ranges].sort((first, second) => first.min - second.min)) {
    const last = merged[merged.length - 1];
    if (last && range.min <= last.max) last.max = Math.max(last.max, range.max);
    else merged.push({ ...range });
  }
  return merged;
};

// NE cuts its polygons at the antimeridian, so the span leaves out the widest gap between them, which need not be
// the one across ±180. A place whose span crosses the antimeridian gets west > east.
const narrowestLongitudeSpan = (polygonLongitudes: Range[]) => {
  const covered = mergedRanges(polygonLongitudes);
  const first = covered[0] ?? { min: -180, max: 180 };
  const last = covered[covered.length - 1] ?? first;
  let span = { west: first.min, east: last.max };
  let widestGap = first.min + 360 - last.max;
  covered.forEach((range, index) => {
    const next = covered[index + 1];
    if (next && next.min - range.max > widestGap) {
      widestGap = next.min - range.max;
      span = { west: next.min, east: range.max };
    }
  });
  return span;
};

const bboxOf = (geometry: Geometry | null): Bbox | undefined => {
  const outerRings = polygonsOf(geometry).flatMap(([outer]) => (outer?.length ? [outer] : []));
  if (!outerRings.length) return undefined;
  const { west, east } = narrowestLongitudeSpan(outerRings.map(ring => rangeOf(ring.map(([lon]) => lon))));
  const latitudes = rangeOf(outerRings.flatMap(ring => ring.map(([, lat]) => lat)));
  return [west, latitudes.min, east, latitudes.max];
};

export const compute = (map: Land): Map<string, PlaceFacts> => {
  const facts = new Map<string, PlaceFacts>();
  for (const { properties, geometry } of map.features) {
    const bbox = bboxOf(geometry);
    if (bbox && !properties.unclaimed) facts.set(properties.id, { bbox });
  }
  return facts;
};
