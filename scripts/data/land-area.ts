import { polygonsOf } from './model.ts';
import type { Geometry, Ring } from './model.ts';

const earthRadiusKm = 6371.0088;
const radians = Math.PI / 180;

const ringAreaKm2 = (ring: Ring) => {
  let sum = 0;
  for (let index = 1; index < ring.length; index++) {
    const [fromLon, fromLat] = ring[index - 1]!;
    const [toLon, toLat] = ring[index]!;
    sum += (toLon - fromLon) * radians * (2 + Math.sin(fromLat * radians) + Math.sin(toLat * radians));
  }
  return Math.abs(sum * earthRadiusKm ** 2 / 2);
};

export const pieceAreaKm2 = ([outer, ...holes]: Ring[]) =>
  (outer ? ringAreaKm2(outer) : 0) - holes.reduce((sum, hole) => sum + ringAreaKm2(hole), 0);

export const largestPiece = (geometry: Geometry | null) => polygonsOf(geometry)
  .map(polygon => ({ polygon, areaKm2: pieceAreaKm2(polygon) }))
  .reduce<{ polygon: Ring[], areaKm2: number } | undefined>(
    (largest, piece) => (largest && largest.areaKm2 >= piece.areaKm2 ? largest : piece),
    undefined,
  );
