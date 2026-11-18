import type { GameState } from '#shared/game/game';
import { unlockSound, useSound } from '~/composables/useSound';

export const usePlayFeedback = (state: () => GameState) => {
  const sound = useSound();

  watch(() => state().phase, (phase) => {
    const current = state();
    if (current.phase === 'verdict') {
      if (current.answer.outcome === 'right') sound.right();
      else sound.wrong();
    }
    else if (phase === 'results') sound.results();
  });

  watch(() => {
    const current = state();
    return current.phase === 'missing' ? current.lastTap : null;
  }, (tap) => {
    if (tap) (tap.kind === 'hit' ? sound.right : sound.wrong)();
  });

  // iOS only starts an AudioContext inside a user gesture
  useEventListener(window, ['pointerdown', 'keydown'], unlockSound, { capture: true, passive: true });
};
