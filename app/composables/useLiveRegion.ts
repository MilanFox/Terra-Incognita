import type { GameState } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

const flushDelayMs = 50;

export const useLiveRegion = () => {
  const message = ref('');
  let pending: string[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  // Phrases announced in the same moment ("Selected." and the verdict it causes) are read as one message.
  const announce = (text: string) => {
    pending.push(text);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => {
      const spoken = pending.join(' ');
      pending = [];
      message.value = '';
      await nextTick();
      message.value = spoken;
    }, flushDelayMs);
  };

  onBeforeUnmount(() => clearTimeout(flushTimer));

  return { message, announce };
};

export const useRoundAnnouncements = (state: () => GameState, announce: ReturnType<typeof useLiveRegion>['announce']) => {
  const { t, locale } = useI18n();
  const game = useGameStore();

  const nameOf = (placeId: string) => game.nameOf(placeId, locale.value);

  watch(() => {
    const current = state();
    if (current.phase === 'verdict') return `verdict-${current.promptNumber}`;
    if (current.phase === 'prompt') return `prompt-${current.promptNumber}-${current.wrongTapPlaceIds.length}`;
    return current.phase;
  }, () => {
    const current = state();
    if (current.phase === 'verdict') {
      const { outcome, placeId, tappedPlaceId } = current.answer;
      announce(outcome === 'right'
        ? t('live.right', { place: nameOf(placeId) })
        : t('live.wrong', { tapped: nameOf(tappedPlaceId), answer: nameOf(placeId) }));
    }
    else if (current.phase === 'prompt') {
      if (current.wrongTapPlaceIds.length > 0) announce(t('round.triesLeft', { count: current.attemptsLeft }, current.attemptsLeft));
      else if (current.setup.variant === 'flag') announce(t('round.findPrompt'));
      else announce(t('live.findName', { place: nameOf(current.placeId) }));
    }
  });
};
