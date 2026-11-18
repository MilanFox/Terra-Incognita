import { describe, expect, it } from 'vitest';
import shippedMap from '../../public/data/map-dependencies.geojson?raw';
import shippedPlaces from '../../public/data/places.json';
import { drawSilhouette } from './silhouette';
import type { Bbox } from './silhouette';

type ShippedPlace = { id: string, silhouette: boolean, bbox: Bbox, silhouetteFrame?: Bbox };
type OwnLand = { properties: { id: string }, geometry: { type: 'Polygon', coordinates: number[][][] } | { type: 'MultiPolygon', coordinates: number[][][][] } };

const places = shippedPlaces as unknown as ShippedPlace[];
const ownLandById = new Map((JSON.parse(shippedMap).features as OwnLand[])
  .map(({ properties, geometry }) => [properties.id, geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates]));

const silhouetteOf = (placeId: string) => {
  const { bbox, silhouetteFrame } = places.find(({ id }) => id === placeId)!;
  return drawSilhouette(ownLandById.get(placeId)!, bbox, silhouetteFrame);
};

const pointsOf = (path: string) => path.split(/[MLZ]/).filter(Boolean).map(point => point.split(' ').map(Number) as [number, number]);

describe('a silhouette', () => {
  it('fits the own land of every readable place into its drawing, places across the antimeridian in one piece', () => {
    for (const { id } of places.filter(({ silhouette }) => silhouette)) {
      const { width, height, path } = silhouetteOf(id);

      expect(Math.max(width, height), id).toBeCloseTo(100);
      expect(pointsOf(path).every(([x, y]) => x >= -0.01 && x <= width + 0.01 && y >= -0.01 && y <= height + 0.01), id).toBe(true);
    }
    expect(silhouetteOf('FJI').width).toBeLessThan(silhouetteOf('FJI').height * 2);
  });

  it('draws north up', () => {
    const chile = silhouetteOf('CHL');
    const [, southernmostY] = pointsOf(chile.path).reduce((southernmost, point) => (point[1] > southernmost[1] ? point : southernmost));

    expect(southernmostY).toBeCloseTo(chile.height);
  });

  it('draws France, the Netherlands and Norway from their mainland frame only', () => {
    for (const id of ['FRA', 'NLD', 'NOR']) {
      const { bbox, silhouetteFrame } = places.find(place => place.id === id)!;
      const framed = silhouetteOf(id);
      const unframed = drawSilhouette(ownLandById.get(id)!, bbox);

      expect(silhouetteFrame, id).toBeDefined();
      expect(framed.path.split('M').length, id).toBeLessThan(unframed.path.split('M').length);
    }
  });
});
