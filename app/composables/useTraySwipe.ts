import type { Ref } from 'vue';

const decideDistancePx = 6;
const settleDistancePx = 40;
const sidewaysRatio = 1.3;
const pageSwipeDistancePx = 48;
const clickGuardMs = 100;

interface Gesture {
  startX: number
  startY: number
  startShift: number
  isDecided: boolean
  isActive: boolean
  isSideways: boolean
  isInSidewaysScroller: boolean
}

interface TraySwipeOptions {
  tray: Ref<HTMLElement | null>
  isOpen: Ref<boolean>
  collapsedShift: Ref<number>
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

const isInSidewaysScroller = (target: EventTarget | null, tray: HTMLElement | null) => {
  for (let element = target instanceof Element ? target : null; element && element !== tray; element = element.parentElement) {
    if (element.scrollWidth > element.clientWidth && ['auto', 'scroll'].includes(getComputedStyle(element).overflowX)) return true;
  }
  return false;
};

// Touch gestures use touch events because pointer events are cancelled once the browser starts scrolling the open tray; mouse and pen use pointer events.
export const useTraySwipe = ({ tray, isOpen, collapsedShift, onSwipeLeft, onSwipeRight }: TraySwipeOptions) => {
  const dragShift = ref<number | null>(null);
  let gesture: Gesture | null = null;
  let isClickSwallowed = false;

  const restingShift = () => (isOpen.value ? 0 : collapsedShift.value);

  const begin = (x: number, y: number, target: EventTarget | null) => {
    isClickSwallowed = false;
    gesture = { startX: x, startY: y, startShift: dragShift.value ?? restingShift(), isDecided: false, isActive: false, isSideways: false, isInSidewaysScroller: isInSidewaysScroller(target, tray.value) };
  };

  const move = (x: number, y: number, event: Event) => {
    if (!gesture) return;
    const deltaX = x - gesture.startX;
    const deltaY = y - gesture.startY;
    if (!gesture.isDecided) {
      const isSideways = !!(onSwipeLeft || onSwipeRight) && Math.abs(deltaX) > Math.abs(deltaY) * sidewaysRatio;
      if (Math.abs(isSideways ? deltaX : deltaY) < decideDistancePx) return;
      gesture.isDecided = true;
      gesture.isSideways = isSideways;
      gesture.isActive = !gesture.isSideways && (!isOpen.value || (deltaY > 0 && (tray.value?.scrollTop ?? 0) <= 0));
    }
    if (!gesture.isActive) return;
    event.preventDefault();
    dragShift.value = Math.min(collapsedShift.value, Math.max(0, gesture.startShift + deltaY));
  };

  const swallowClick = () => {
    isClickSwallowed = true;
    setTimeout(() => {
      isClickSwallowed = false;
    }, clickGuardMs);
  };

  const end = (x: number, y: number) => {
    const finished = gesture;
    gesture = null;
    if (finished?.isSideways && !finished.isInSidewaysScroller) {
      const deltaX = x - finished.startX;
      if (Math.abs(deltaX) < pageSwipeDistancePx) return;
      (deltaX < 0 ? onSwipeLeft : onSwipeRight)?.();
      swallowClick();
      return;
    }
    if (!finished?.isActive) return;
    const deltaY = y - finished.startY;
    if (deltaY < -settleDistancePx) isOpen.value = true;
    else if (deltaY > settleDistancePx) isOpen.value = false;
    else isOpen.value = (dragShift.value ?? 0) < collapsedShift.value / 2;
    dragShift.value = null;
    swallowClick();
  };

  const isMouseLike = (event: PointerEvent) => event.pointerType !== 'touch';

  useEventListener(window, 'pointermove', (event) => {
    if (isMouseLike(event)) move(event.clientX, event.clientY, event);
  });
  useEventListener(window, ['pointerup', 'pointercancel'], (event) => {
    if (isMouseLike(event)) end(event.clientX, event.clientY);
  });

  const onPointerDown = (event: PointerEvent) => {
    if (isMouseLike(event) && event.button === 0) begin(event.clientX, event.clientY, event.target);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 1) begin(event.touches[0]!.clientX, event.touches[0]!.clientY, event.target);
    else gesture = null;
  };

  const onTouchMove = (event: TouchEvent) => move(event.touches[0]!.clientX, event.touches[0]!.clientY, event);

  const onTouchEnd = (event: TouchEvent) => end(event.changedTouches[0]!.clientX, event.changedTouches[0]!.clientY);

  const onClickCapture = (event: MouseEvent) => {
    if (!isClickSwallowed) return;
    isClickSwallowed = false;
    event.stopPropagation();
    event.preventDefault();
  };

  return { dragShift, onPointerDown, onTouchStart, onTouchMove, onTouchEnd, onClickCapture };
};
