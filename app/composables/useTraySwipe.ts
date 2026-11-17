import type { Ref } from 'vue';

const decideDistancePx = 6;
const settleDistancePx = 40;
const clickGuardMs = 100;

interface Gesture {
  startY: number
  startShift: number
  isDecided: boolean
  isActive: boolean
}

interface TraySwipeOptions {
  tray: Ref<HTMLElement | null>
  isOpen: Ref<boolean>
  collapsedShift: Ref<number>
}

// Touch gestures use touch events because pointer events are cancelled once the browser starts scrolling the open tray; mouse and pen use pointer events.
export const useTraySwipe = ({ tray, isOpen, collapsedShift }: TraySwipeOptions) => {
  const dragShift = ref<number | null>(null);
  let gesture: Gesture | null = null;
  let isClickSwallowed = false;

  const restingShift = () => (isOpen.value ? 0 : collapsedShift.value);

  const begin = (y: number) => {
    isClickSwallowed = false;
    gesture = { startY: y, startShift: dragShift.value ?? restingShift(), isDecided: false, isActive: false };
  };

  const move = (y: number, event: Event) => {
    if (!gesture) return;
    const deltaY = y - gesture.startY;
    if (!gesture.isDecided) {
      if (Math.abs(deltaY) < decideDistancePx) return;
      gesture.isDecided = true;
      gesture.isActive = !isOpen.value || (deltaY > 0 && (tray.value?.scrollTop ?? 0) <= 0);
    }
    if (!gesture.isActive) return;
    event.preventDefault();
    dragShift.value = Math.min(collapsedShift.value, Math.max(0, gesture.startShift + deltaY));
  };

  const end = (y: number) => {
    const finished = gesture;
    gesture = null;
    if (!finished?.isActive) return;
    const deltaY = y - finished.startY;
    if (deltaY < -settleDistancePx) isOpen.value = true;
    else if (deltaY > settleDistancePx) isOpen.value = false;
    else isOpen.value = (dragShift.value ?? 0) < collapsedShift.value / 2;
    dragShift.value = null;
    isClickSwallowed = true;
    setTimeout(() => {
      isClickSwallowed = false;
    }, clickGuardMs);
  };

  const isMouseLike = (event: PointerEvent) => event.pointerType !== 'touch';

  useEventListener(window, 'pointermove', (event) => {
    if (isMouseLike(event)) move(event.clientY, event);
  });
  useEventListener(window, ['pointerup', 'pointercancel'], (event) => {
    if (isMouseLike(event)) end(event.clientY);
  });

  const onPointerDown = (event: PointerEvent) => {
    if (isMouseLike(event) && event.button === 0) begin(event.clientY);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 1) begin(event.touches[0]!.clientY);
    else gesture = null;
  };

  const onTouchMove = (event: TouchEvent) => move(event.touches[0]!.clientY, event);

  const onTouchEnd = (event: TouchEvent) => end(event.changedTouches[0]!.clientY);

  const onClickCapture = (event: MouseEvent) => {
    if (!isClickSwallowed) return;
    isClickSwallowed = false;
    event.stopPropagation();
    event.preventDefault();
  };

  return { dragShift, onPointerDown, onTouchStart, onTouchMove, onTouchEnd, onClickCapture };
};
