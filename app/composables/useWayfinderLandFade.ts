import type { GameState } from '#shared/game/game';

const landFadeMs = 900;

const smoothstep = (progress: number) => progress * progress * (3 - 2 * progress);

export const useWayfinderLandFade = (state: () => GameState) => {
  const landShown = ref(1);
  let frame = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  const fadeIn = () => {
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / landFadeMs));
      landShown.value = smoothstep(progress);
      frame = progress < 1 ? requestAnimationFrame(step) : 0;
    };
    landShown.value = 0;
    frame = requestAnimationFrame(step);
  };

  watch(() => {
    const current = state();
    if (current.phase !== 'wayfinder' || current.setup.easy) return 'land';
    return current.route.outcome === 'open' ? 'blank' : `reveal-${current.routeNumber}`;
  }, (look) => {
    stop();
    if (look === 'land') landShown.value = 1;
    else if (look === 'blank') landShown.value = 0;
    else fadeIn();
  }, { immediate: true });

  onBeforeUnmount(stop);

  return landShown;
};
