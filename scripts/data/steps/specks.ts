import { largestPiece } from '../land-area.ts';
import { runMapshaper } from '../mapshaper.ts';
import { byId, featureCollection } from '../model.ts';
import type { Feature, Land } from '../model.ts';

type Point = [number, number];
export type SpeckPoint = { id: string, speckZoom: number, coordinates: Point };

const speckPx = 2;
const tilePx = 512;
const equatorKm = 40075.016686;

// The zoom from which a square the size of the largest piece is speckPx wide. Web Mercator draws land
// 1 / cos(latitude) times larger away from the equator, so the same piece needs less zoom further from it.
const speckZoomOf = (areaKm2: number, [, latitude]: Point) => {
  const kmPerPxAtZoom0 = equatorKm * Math.cos(latitude * Math.PI / 180) / tilePx;
  return Math.ceil(Math.log2(speckPx * kmPerPxAtZoom0 / Math.sqrt(areaKm2)) * 10) / 10;
};

export const speckPoints = async (map: Land): Promise<SpeckPoint[]> => {
  const areaById = new Map<string, number>();
  const largestPieces: Feature<{ id: string }>[] = map.features.flatMap(({ properties: { id, unclaimed }, geometry }) => {
    const piece = unclaimed ? undefined : largestPiece(geometry);
    if (!piece) return [];
    areaById.set(id, piece.areaKm2);
    return [{ type: 'Feature', properties: { id }, geometry: { type: 'Polygon', coordinates: piece.polygon } }];
  });
  const innerPoints = await runMapshaper<{ id: string }>({
    inputs: { 'pieces.json': featureCollection(largestPieces) },
    commands: '-i pieces.json -points inner',
    outputOptions: 'precision=0.001',
  });
  return innerPoints.features.map(({ properties: { id }, geometry }) => {
    const { coordinates } = geometry as unknown as { coordinates: Point };
    return { id, speckZoom: speckZoomOf(areaById.get(id) ?? 0, coordinates), coordinates };
  });
};

export const pointsText = (points: SpeckPoint[]) => {
  const features = [...points].sort(byId).map(({ id, speckZoom, coordinates }) => JSON.stringify({
    type: 'Feature',
    properties: { id, speckZoom },
    geometry: { type: 'Point', coordinates },
  }));
  return `{"type":"FeatureCollection","features":[\n${features.join(',\n')}\n]}\n`;
};
