import { rightAnswerFadeMs, rightAnswerHoldMs } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

const smoothstep = (progress: number) => progress * progress * (3 - 2 * progress);

export const useRightAnswerFade = () => {
  const game = useGameStore();
  const fade = ref(0);
  let frame = 0;

  const step = () => {
    frame = 0;
    const { state } = game;
    if (state.phase !== 'verdict' || state.answer.outcome !== 'right') return;
    fade.value = smoothstep(Math.min(1, Math.max(0, (Date.now() - state.answeredAt - rightAnswerHoldMs) / rightAnswerFadeMs)));
    game.send({ type: 'tick' });
    frame = requestAnimationFrame(step);
  };

  watch(() => game.state, (state) => {
    if (state.phase === 'verdict' && state.answer.outcome === 'right') {
      if (!frame) frame = requestAnimationFrame(step);
      return;
    }
    cancelAnimationFrame(frame);
    frame = 0;
    fade.value = 0;
  });

  onBeforeUnmount(() => cancelAnimationFrame(frame));

  return fade;
};
