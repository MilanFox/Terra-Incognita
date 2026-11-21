// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { featureCollection } from '../model.ts';
import { chainsOf } from './chains.ts';
import type { Ring } from '../model.ts';
import type { ChainRulings } from './chains.ts';

type Islands = Record<string, [number, number][]>;

const islandAt = ([longitude, latitude]: [number, number]): Ring[] => [[
  [longitude - 0.05, latitude - 0.05],
  [longitude + 0.05, latitude - 0.05],
  [longitude + 0.05, latitude + 0.05],
  [longitude - 0.05, latitude + 0.05],
  [longitude - 0.05, latitude - 0.05],
]];

const chainsAround = (islands: Islands) => {
  const land = featureCollection(Object.entries(islands).map(([id, centres]) => ({
    type: 'Feature' as const,
    properties: { id },
    geometry: { type: 'MultiPolygon' as const, coordinates: centres.map(islandAt) },
  })));
  const places = Object.fromEntries(Object.keys(islands).map(id => [id, { tier: 'sovereign' as const }]));
  const rulings: ChainRulings = { keep: Object.fromEntries(Object.keys(islands).map(id => [id, 'test'])), drop: {} };
  return chainsOf({ sovereign: land, defacto: land, dependencies: land }, places, rulings);
};

const isInside = ([longitude, latitude]: [number, number], ring: Ring) => ring.reduce((inside, [fromLon, fromLat], index) => {
  const [toLon, toLat] = ring[(index + 1) % ring.length]!;
  const crosses = (fromLat > latitude) !== (toLat > latitude)
    && longitude < fromLon + (latitude - fromLat) / (toLat - fromLat) * (toLon - fromLon);
  return crosses ? !inside : inside;
}, false);

describe('chainsOf', () => {
  it('draws one unbroken outline around a chain that crosses the 180° line', () => {
    const { outlines } = chainsAround({ KIR: [[173, 1], [178, -2], [-172, -4], [-157, 2]] });

    expect(outlines).toHaveLength(1);
    const [{ ring }] = outlines as [typeof outlines[number]];
    const longitudes = ring.map(([longitude]) => longitude);
    expect(Math.min(...longitudes)).toBeGreaterThan(170);
    expect(Math.max(...longitudes)).toBeLessThan(206);
    for (const island of [[173, 1], [178, -2], [188, -4], [203, 2]] as [number, number][]) expect(isInside(island, ring)).toBe(true);
  });

  it('fits the outline closer to the islands when the convex hull would cover another chain', () => {
    const cornerChain: [number, number][] = [[0, 0], [0, 5], [0, 10], [5, 10], [10, 10]];
    const { outlines, overlaps } = chainsAround({ AAA: cornerChain, BBB: [[3, 6], [4, 7]] });

    expect(overlaps).toEqual([]);
    expect(outlines.map(({ id }) => id)).toEqual(['AAA', 'BBB']);
    const [{ ring: cornerRing }] = outlines as [typeof outlines[number]];
    for (const island of cornerChain) expect(isInside(island, cornerRing)).toBe(true);
    expect(isInside([3, 6], cornerRing)).toBe(false);
    expect(isInside([4, 7], cornerRing)).toBe(false);
  });

  it('reports chains whose islands lie between each other as overlapping', () => {
    const { outlines, overlaps } = chainsAround({ AAA: [[0, 0], [1, 1]], BBB: [[0, 1], [1, 0]] });

    expect(outlines).toHaveLength(2);
    expect(overlaps).toEqual(['AAA-BBB']);
  });

  it('keeps outlines apart that would meet across the 180° line', () => {
    const { outlines, overlaps } = chainsAround({
      AAA: [[177, -2], [179, -2], [179, 2], [177, 2]],
      BBB: [[-179.9, -2], [-177.9, -2], [-177.9, 2], [-179.9, 2]],
    });

    expect(overlaps).toEqual([]);
    const [beforeLine, afterLine] = outlines.map(({ ring }) => ring.map(([longitude]) => longitude));
    expect(Math.max(...beforeLine!)).toBeLessThan(Math.min(...afterLine!) + 360);
  });
});
