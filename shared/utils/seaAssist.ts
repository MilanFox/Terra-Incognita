export interface ScreenSpeck {
  placeId: string
  x: number
  y: number
  speckZoom: number
}

export const seaAssistRadiusPx = 22;
const speckPx = 2;

// A place's land is speckPx wide at its speckZoom and twice as wide with each zoom level above it. The assist lets go
// once the land is as wide as the assist circle around its point.
const isNarrowerThanAssist = (speckZoom: number, zoom: number) => speckPx * 2 ** (zoom - speckZoom) < 2 * seaAssistRadiusPx;

export const seaAssistPlaceId = (tap: { x: number, y: number }, specks: ScreenSpeck[], zoom: number) => {
  let nearest: string | undefined;
  let nearestDistance = seaAssistRadiusPx;
  for (const { placeId, x, y, speckZoom } of specks) {
    const distance = Math.hypot(x - tap.x, y - tap.y);
    if (distance <= nearestDistance && isNarrowerThanAssist(speckZoom, zoom)) [nearest, nearestDistance] = [placeId, distance];
  }
  return nearest;
};
