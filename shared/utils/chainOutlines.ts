import { seaAssistPlaceId } from './seaAssist';
import type { ScreenSpeck } from './seaAssist';

export interface MapDrawing {
  landShown: number
  drawnPlaceIds: string[]
  poolPlaceIds: string[] | null
  gapPlaceIds: string[]
}

interface AidedTap {
  tap: { x: number, y: number }
  outlinedPlaceIds: string[]
  specks: ScreenSpeck[]
  zoom: number
}

export const chainOutlineShown = (placeId: string, drawing: MapDrawing) => {
  if (drawing.gapPlaceIds.includes(placeId)) return 1;
  if (drawing.poolPlaceIds && !drawing.poolPlaceIds.includes(placeId)) return 0;
  return drawing.drawnPlaceIds.includes(placeId) ? 1 : drawing.landShown;
};

export const aidedPlaceId = ({ tap, outlinedPlaceIds, specks, zoom }: AidedTap, drawing: MapDrawing) => {
  const isShown = (placeId: string) => chainOutlineShown(placeId, drawing) > 0;
  return outlinedPlaceIds.find(isShown) ?? seaAssistPlaceId(tap, specks.filter(({ placeId }) => isShown(placeId)), zoom);
};
