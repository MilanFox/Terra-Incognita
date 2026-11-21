import type { MaybeRefOrGetter } from 'vue';

export interface MapFreeArea {
  top: number
  right: number
  bottom: number
  left: number
}

type Cover = MaybeRefOrGetter<HTMLElement | null | undefined>;

export const freeAreaKeyOf = (freeArea: MapFreeArea | null | undefined) => freeArea && Object.values(freeArea).join();

// Offsets, not the bounding box: screens and trays move in with a transform, which a bounding box would catch mid-flight.
const layoutBoxOf = (element: HTMLElement) => {
  let top = 0;
  let left = 0;
  for (let current: HTMLElement | null = element; current; current = current.offsetParent as HTMLElement | null) {
    top += current.offsetTop;
    left += current.offsetLeft;
  }
  return { top, left, bottom: top + element.offsetHeight, right: left + element.offsetWidth };
};

export const useMapFreeArea = ({ map, top, bottom, right }: { map: Cover, top?: Cover, bottom?: Cover, right?: Cover }) => {
  const coversAndTheirParents = [top, bottom, right].flatMap(cover => [cover, () => toValue(cover)?.parentElement]);
  const sizes = [map, ...coversAndTheirParents].map(element => useElementSize(() => toValue(element), undefined, { box: 'border-box' }));

  const edgesOf = (cover?: Cover) => {
    const element = toValue(cover);
    return element ? layoutBoxOf(element) : null;
  };

  return computed<MapFreeArea | null>(() => {
    // Offsets aren't reactive, so every observed size is read for its changes to recompute the free area (a cover moves when its parent grows); the first is the map's.
    const [mapSize] = sizes.map(({ width, height }) => width.value * height.value);
    const mapEdges = edgesOf(map);
    if (!mapEdges || !mapSize) return null;
    const topCover = edgesOf(top);
    const bottomCover = edgesOf(bottom);
    const rightCover = edgesOf(right);
    return {
      top: topCover ? Math.max(0, topCover.bottom - mapEdges.top) : 0,
      right: rightCover ? Math.max(0, mapEdges.right - rightCover.left) : 0,
      bottom: bottomCover ? Math.max(0, mapEdges.bottom - bottomCover.top) : 0,
      left: 0,
    };
  });
};
