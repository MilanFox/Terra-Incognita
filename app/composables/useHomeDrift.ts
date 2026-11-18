import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Ref } from 'vue';
import { useReducedMotion } from '~/composables/useReducedMotion';

const degreesPerSecond = 4;
const touchEvents = ['pointerdown', 'wheel', 'keydown'] as const;

export const useHomeDrift = (getMap: () => MapLibreMap | undefined, isDrifting: Ref<boolean>) => {
  const isMotionReduced = useReducedMotion();
  let frame = 0;
  let isStoppedForVisit = false;
  let stopListening = () => {};

  const stop = () => {
    cancelAnimationFrame(frame);
    stopListening();
    stopListening = () => {};
  };

  const stopForVisit = () => {
    isStoppedForVisit = true;
    stop();
  };

  const start = () => {
    const map = getMap();
    if (!map || isStoppedForVisit || isMotionReduced.value) return;
    stop();
    const container = map.getCanvasContainer();
    for (const eventName of touchEvents) container.addEventListener(eventName, stopForVisit, { passive: true });
    stopListening = () => {
      for (const eventName of touchEvents) container.removeEventListener(eventName, stopForVisit);
    };
    let last = performance.now();
    const step = (now: number) => {
      if (map.isMoving()) {
        last = now;
        frame = requestAnimationFrame(step);
        return;
      }
      const { lng, lat } = map.getCenter();
      map.jumpTo({ center: [((lng + degreesPerSecond * (now - last) / 1000 + 540) % 360) - 180, lat] });
      last = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  watch(isDrifting, (isNowDrifting) => {
    if (isNowDrifting) start();
    else {
      stop();
      isStoppedForVisit = false;
    }
  }, { immediate: true });

  watch(isMotionReduced, (isReduced) => {
    if (isReduced) stop();
    else if (isDrifting.value) start();
  });

  onBeforeUnmount(stop);

  return { stopForVisit };
};
