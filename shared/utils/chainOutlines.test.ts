import { describe, expect, it } from 'vitest';
import { aidedPlaceId, chainOutlineShown } from './chainOutlines';
import type { MapDrawing } from './chainOutlines';

const fullMap: MapDrawing = { landShown: 1, drawnPlaceIds: [], poolPlaceIds: null, gapPlaceIds: [] };
const blankWayfinderMap: MapDrawing = { ...fullMap, landShown: 0, drawnPlaceIds: ['DEU', 'TUR'] };

describe('chainOutlineShown', () => {
  it('hides the outline of a place the blank Wayfinder map does not draw', () => {
    expect(chainOutlineShown('PLW', blankWayfinderMap)).toBe(0);
  });

  it('shows the outline of a pick drawn on the blank Wayfinder map', () => {
    expect(chainOutlineShown('PLW', { ...blankWayfinderMap, drawnPlaceIds: ['DEU', 'TUR', 'PLW'] })).toBe(1);
  });

  it('fades the outlines in with the land at the Wayfinder reveal', () => {
    expect(chainOutlineShown('PLW', { ...blankWayfinderMap, landShown: 0.4 })).toBe(0.4);
  });

  it('shows every outline on the full map of a Wayfinder round in Easy mode', () => {
    expect(chainOutlineShown('PLW', { ...blankWayfinderMap, landShown: 1 })).toBe(1);
  });

  it('shows outlines only inside the pool when the places outside it are dimmed', () => {
    const europePreview = { ...fullMap, poolPlaceIds: ['FRA', 'GGY'] };
    expect(['GGY', 'PLW'].map(placeId => chainOutlineShown(placeId, europePreview))).toEqual([1, 0]);
  });

  it('keeps the outline of an unfound What\'s missing gap, which is dimmed as the question', () => {
    expect(chainOutlineShown('SLB', { ...fullMap, poolPlaceIds: ['FRA', 'PLW'], gapPlaceIds: ['SLB'] })).toBe(1);
  });
});

describe('aidedPlaceId', () => {
  const tap = { x: 100, y: 100 };

  it('picks nothing for a tap inside an outline that is hidden', () => {
    expect(aidedPlaceId({ tap, outlinedPlaceIds: ['PLW'], specks: [], zoom: 2 }, blankWayfinderMap)).toBeUndefined();
  });

  it('picks the shown outline where a hidden one overlaps it', () => {
    expect(aidedPlaceId({ tap, outlinedPlaceIds: ['VIR', 'VGB'], specks: [], zoom: 2 }, { ...fullMap, poolPlaceIds: ['VGB'] })).toBe('VGB');
  });

  it('lets the sea assist pass over a tiny island whose outline is hidden', () => {
    const specks = [{ placeId: 'TUV', x: 104, y: 100, speckZoom: 6 }, { placeId: 'KIR', x: 100, y: 115, speckZoom: 6 }];
    expect(aidedPlaceId({ tap, outlinedPlaceIds: [], specks, zoom: 2 }, { ...blankWayfinderMap, drawnPlaceIds: ['KIR'] })).toBe('KIR');
  });
});
