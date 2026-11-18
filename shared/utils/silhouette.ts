export type Bbox = [west: number, south: number, east: number, north: number];
type Position = number[];
type Polygon = Position[][];

const drawingSize = 100;

const isInFrame = ([west, south, east, north]: Bbox, [outline]: Polygon) => outline!.some(([lon, lat]) =>
  lat! >= south && lat! <= north && (east >= west ? lon! >= west && lon! <= east : lon! >= west || lon! <= east));

export const drawSilhouette = (ownLand: Polygon[], bbox: Bbox, frame?: Bbox) => {
  const [west, south, east, north] = frame ?? bbox;
  const lonScale = Math.cos(((south + north) / 2) * Math.PI / 180);
  const widthUnits = Math.max((east >= west ? east - west : east + 360 - west) * lonScale, 1e-6);
  const heightUnits = Math.max(north - south, 1e-6);
  const scale = drawingSize / Math.max(widthUnits, heightUnits);
  // Longitude measured east from the west edge, so a place across the antimeridian stays in one piece.
  const project = ([lon, lat]: Position) => `${(((lon! - west + 720) % 360) * lonScale * scale).toFixed(2)} ${((north - lat!) * scale).toFixed(2)}`;
  const shownLand = frame ? ownLand.filter(polygon => isInFrame(frame, polygon)) : ownLand;
  return {
    width: widthUnits * scale,
    height: heightUnits * scale,
    path: shownLand.flat().map(ring => `M${ring.map(project).join('L')}Z`).join(''),
  };
};
