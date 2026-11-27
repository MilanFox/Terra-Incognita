import { chainOutlineShown } from './chainOutlines';
import type { MapDrawing } from './chainOutlines';
import { seaAssistPlaceId } from './seaAssist';
import type { ScreenSpeck } from './seaAssist';

interface LandTap {
  tap: { x: number, y: number }
  hitPlaceId: string
  specks: ScreenSpeck[]
  zoom: number
  microstatePlaceIds: string[]
}

// Only microstates, so a mid-sized place at world view does not take the taps meant for its neighbours.
export const landAidedPlaceId = ({ tap, hitPlaceId, specks, zoom, microstatePlaceIds }: LandTap, drawing: MapDrawing) => {
  const isAided = ({ placeId, speckZoom }: ScreenSpeck) => zoom >= speckZoom && microstatePlaceIds.includes(placeId) && chainOutlineShown(placeId, drawing) > 0;
  return seaAssistPlaceId(tap, specks.filter(isAided), zoom) ?? hitPlaceId;
};
