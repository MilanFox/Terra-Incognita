import { isNoMapMode, isTypedMode } from '#shared/game/game';
import type { GameState } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

const flushDelayMs = 50;
const announcedSecondsLeft = [60, 30, 10];

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

  const pickedCapitalOf = (placeId: string) => game.firstCapitalNameOf(placeId, locale.value);

  const capitalNamesOf = (placeId: string) => game.capitalNamesOf(placeId, locale.value);

  watch(() => {
    const current = state();
    if (current.phase === 'verdict') return `verdict-${current.promptNumber}`;
    if (current.phase === 'fill') return `fill-${current.inputCount}`;
    if (current.phase === 'missing') return `missing-${current.foundPlaceIds.length}-${current.tapsLeft}`;
    if (current.phase === 'prompt') return `prompt-${current.promptNumber}-${current.wrongTapPlaceIds.length}-${current.unresolvedAnswers.length}`;
    return current.phase;
  }, () => {
    const current = state();
    if (current.phase === 'verdict') {
      const { answer } = current;
      if (current.setup.mode === 'capital') {
        if (answer.outcome === 'right') announce(t('capital.live.right', { capitals: capitalNamesOf(answer.placeId) }));
        else if (answer.outcome === 'missed') announce(t('capital.live.missed', { capitals: capitalNamesOf(answer.placeId) }));
        else if (current.setup.easy) announce(t('capital.live.wrongPicked', { picked: pickedCapitalOf(answer.tappedPlaceId), capitals: capitalNamesOf(answer.placeId) }));
        else announce(t('capital.live.wrong', { typed: nameOf(answer.tappedPlaceId), capitals: capitalNamesOf(answer.placeId) }));
      }
      else if (answer.outcome === 'right') announce(t('live.right', { place: nameOf(answer.placeId) }));
      else if (answer.outcome === 'missed') announce(t('typed.live.missed', { answer: nameOf(answer.placeId) }));
      else if (isTypedMode(current.setup.mode)) announce(t('typed.live.wrong', { typed: nameOf(answer.tappedPlaceId), answer: nameOf(answer.placeId) }));
      else announce(t('live.wrong', { tapped: nameOf(answer.tappedPlaceId), answer: nameOf(answer.placeId) }));
    }
    else if (current.phase === 'fill') {
      const { lastInput } = current;
      if (!lastInput) announce(t('fill.live.start', { total: current.deckSize }));
      else if (lastInput.kind === 'filled') announce(t('fill.live.filled', { place: nameOf(lastInput.placeId), count: current.score, total: current.deckSize }));
      else announce(t(`fill.live.${lastInput.kind}`, { place: 'placeId' in lastInput ? nameOf(lastInput.placeId) : '' }));
    }
    else if (current.phase === 'missing') {
      const { lastTap, tapsLeft } = current;
      const tapsText = t('missing.taps', { count: tapsLeft }, tapsLeft);
      if (lastTap?.kind === 'hit') announce(t('missing.live.found', { place: nameOf(lastTap.placeId), found: current.foundPlaceIds.length, total: current.gapPlaceIds.length }));
      else if (lastTap?.kind === 'wrong') announce(t('missing.live.wrongPlace', { place: nameOf(lastTap.placeId), taps: tapsText }));
      else if (lastTap) announce(t('missing.live.sea', { taps: tapsText }));
      else announce(t('missing.live.start', { count: tapsLeft }));
    }
    else if (current.phase === 'prompt') {
      const lastUnresolved = current.unresolvedAnswers.at(-1);
      if (current.learning?.isEverythingLearned && !lastUnresolved && current.wrongTapPlaceIds.length === 0) announce(t('learn.liveEverythingLearned'));
      if (lastUnresolved) announce(lastUnresolved === 'ambiguous' ? t('typed.ambiguous') : t(current.setup.mode === 'capital' ? 'capital.live.noMatch' : 'typed.live.noMatch'));
      else if (current.wrongTapPlaceIds.length > 0) announce(t('round.triesLeft', { count: current.attemptsLeft }, current.attemptsLeft));
      else if (current.setup.mode === 'capital') announce(t('capital.promptLive', { place: nameOf(current.placeId) }));
      else if (isNoMapMode(current.setup.mode)) announce(t(`sighting.prompt.${current.setup.variant}`));
      else if (isTypedMode(current.setup.mode)) announce(t('typed.prompt'));
      else if (current.setup.variant === 'flag') announce(t('round.findPrompt'));
      else announce(t('live.findName', { place: nameOf(current.placeId) }));
    }
  });

  const spokenTimeLeft = (seconds: number) => (seconds % 60 === 0
    ? t('record.minutes', { count: seconds / 60 }, seconds / 60)
    : t('record.seconds', { count: seconds }, seconds));

  watch(() => game.timeLeftMs, (timeLeftMs, previousMs) => {
    if (timeLeftMs === null || previousMs === null) return;
    const crossedSeconds = announcedSecondsLeft.findLast(seconds => timeLeftMs <= seconds * 1000 && previousMs > seconds * 1000);
    if (crossedSeconds) announce(t('live.timeLeft', { time: spokenTimeLeft(crossedSeconds) }));
  });
};
