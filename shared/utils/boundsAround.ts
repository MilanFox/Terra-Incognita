export type LngLatBox = [[number, number], [number, number]];

const spanOf = ([[west], [east]]: LngLatBox) => east - west;

const boxAround = (boxes: LngLatBox[]): LngLatBox => [
  [Math.min(...boxes.map(([[west]]) => west)), Math.min(...boxes.map(([[, south]]) => south))],
  [Math.max(...boxes.map(([, [east]]) => east)), Math.max(...boxes.map(([, [, north]]) => north))],
];

export const boundsAround = (boxes: LngLatBox[]): LngLatBox => {
  const plain = boxAround(boxes);
  // Boxes west of the antimeridian are shifted east when that gives the narrower box (Oceania), so the fit doesn't wrap the whole world.
  const shifted = boxAround(boxes.map(([[west, south], [east, north]]) => (east < 0 ? [[west + 360, south], [east + 360, north]] : [[west, south], [east, north]]) as LngLatBox));
  return spanOf(shifted) < spanOf(plain) ? shifted : plain;
};
