<script setup lang="ts">
import type { GameState } from '#shared/game/game';
import { useNextDailyCountdown } from '~/composables/useNextDailyCountdown';
import { useDurationText } from '~/composables/useDurationText';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'results' }> }>();
const emit = defineEmits<{ playAgain: [], changeSetup: [], leave: [] }>();

const { locale, t } = useI18n();
const game = useGameStore();

const isDaily = computed(() => props.state.dailyDate !== null);
const isPerfectDay = computed(() => isDaily.value && props.state.score === props.state.deckSize);
const { shown: nextDailyShown, spoken: nextDailySpoken } = useNextDailyCountdown();
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
const countedStreak = ref(0);
const shownStreak = useTransition(countedStreak, { duration: computed(() => (prefersReducedMotion.value ? 0 : streakCountMs)), delay: computed(() => (prefersReducedMotion.value ? 0 : streakCountDelayMs)) });
const shareNotice = ref('');

const titleId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const title = useTemplateRef<HTMLHeadingElement>('title');

const streakCountDelayMs = 900;
const streakCountMs = 700;

type ResultOutcome = 'right' | 'wrong' | 'missed';

const shareMarks: Record<ResultOutcome, string> = { right: '🟩', wrong: '🟥', missed: '⬜' };

const cellMarks: Record<ResultOutcome, string> = { right: '✓', wrong: '✗', missed: '–' };

const placeName = (placeId: string) => game.nameOf(placeId, locale.value);

const resultCells = computed(() => [
  ...props.state.answers.map(({ placeId, outcome }) => ({ placeId, outcome: outcome as ResultOutcome })),
  ...props.state.missedPlaceIds.map(placeId => ({ placeId, outcome: 'missed' as ResultOutcome })),
]);

const wrongCount = computed(() => props.state.answers.length - props.state.score);

const durationTextOf = useDurationText();

const elapsedTime = computed(() => durationTextOf(Math.round(props.state.elapsedMs / 1000)));

const newBestLine = computed(() => t('record.newBest', {
  region: t(`setup.regions.${props.state.setup.region}`),
  tier: t(`setup.tiers.${props.state.setup.tier}`),
  deckSize: t(`setup.deckSizes.${props.state.setup.deckSize}`),
}));

const statTiles = computed(() => [
  { label: t('results.score'), value: String(props.state.score), total: props.state.deckSize, text: t('results.scoreText', { score: props.state.score, total: props.state.deckSize }) },
  { label: t('results.wrongCount'), value: String(wrongCount.value) },
  { label: t('results.unreachedCount'), value: String(props.state.missedPlaceIds.length) },
]);

const shareText = computed(() => [
  [t('daily.shareHeader', { date: props.state.dailyDate }), props.state.setup.variant === 'flag' ? t('daily.hard') : ''].filter(Boolean).join(' · '),
  t('daily.shareScore', { score: props.state.score, total: props.state.deckSize }),
  resultCells.value.map(({ outcome }) => shareMarks[outcome]).join(''),
  t('daily.shareStreak', { count: game.streak.current }),
].join('\n'));

const share = async () => {
  shareNotice.value = '';
  if (navigator.share) {
    try {
      await navigator.share({ text: shareText.value });
    }
    catch {
      // Dismissing the share sheet is not an error.
    }
    return;
  }
  await navigator.clipboard?.writeText(shareText.value);
  shareNotice.value = t('daily.copied');
};

const unreachedNames = computed(() => props.state.missedPlaceIds.map(placeName).join(', '));

const focusableTiles = () => [...tray.value!.querySelectorAll<HTMLElement>('button')];

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('leave');
    return;
  }
  if (event.key !== 'Tab') return;
  const tiles = focusableTiles();
  const first = tiles[0]!;
  const last = tiles.at(-1)!;
  const active = document.activeElement;
  const isLeaving = event.shiftKey ? active === first || active === title.value : active === last;
  if (!tray.value!.contains(active) || isLeaving) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
};

onMounted(() => {
  title.value?.focus({ preventScroll: true });
  countedStreak.value = game.streak.current;
});

defineExpose({ element: tray });
</script>

<template>
  <section
    ref="tray"
    class="tray results-tray"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    @keydown="handleKeydown"
  >
    <h2
      :id="titleId"
      ref="title"
      class="results-tray__title"
      tabindex="-1"
    >
      {{ state.isComplete ? $t('results.title') : $t('results.titleEnded') }}
    </h2>

    <p
      v-if="state.isNewBest"
      class="results-tray__new-best"
    >
      {{ newBestLine }}
    </p>

    <div
      v-if="isDaily"
      class="tile results-tray__streak"
    >
      <span
        class="results-tray__streak-value"
        aria-hidden="true"
      >{{ Math.round(shownStreak) }}</span>

      <span class="visually-hidden">{{ $t('daily.streakLine', { count: game.streak.current }, game.streak.current) }}</span>

      <span
        class="kicker results-tray__stat-label"
        aria-hidden="true"
      >{{ $t('daily.streak') }}</span>
    </div>

    <div class="results-tray__stats">
      <div
        v-for="(stat, index) in statTiles"
        :key="stat.label"
        class="tile results-tray__stat"
        :style="{ '--index': index }"
      >
        <span
          class="results-tray__stat-value"
          :aria-hidden="stat.text ? true : undefined"
        >{{ stat.value }}<small v-if="stat.total">/{{ stat.total }}</small></span>

        <span
          v-if="stat.text"
          class="visually-hidden"
        >{{ stat.text }}</span>

        <span class="kicker results-tray__stat-label">{{ stat.label }}</span>
      </div>
    </div>

    <ol
      class="results-tray__cells"
      :class="{ 'results-tray__cells--daily': isDaily, 'results-tray__cells--perfect': isPerfectDay }"
    >
      <li
        v-for="(cell, index) in resultCells"
        :key="cell.placeId"
        class="result-cell"
        :class="`result-cell--${cell.outcome}`"
        :style="{ '--index': index }"
      >
        <span aria-hidden="true">{{ cellMarks[cell.outcome] }}</span>

        <span class="visually-hidden">{{ $t(`results.${cell.outcome}`, { place: placeName(cell.placeId) }) }}</span>
      </li>
    </ol>

    <p class="results-tray__time">
      <span aria-hidden="true">{{ $t('record.time', { time: elapsedTime.shown }) }}</span>

      <span class="visually-hidden">{{ $t('record.time', { time: elapsedTime.spoken }) }}</span>
    </p>

    <p
      v-if="isPerfectDay"
      class="results-tray__perfect"
    >
      {{ $t('daily.perfect') }}
    </p>

    <p
      v-if="isDaily"
      class="results-tray__time"
    >
      <span aria-hidden="true">{{ $t('daily.next', { time: nextDailyShown }) }}</span>

      <span class="visually-hidden">{{ $t('daily.next', { time: nextDailySpoken }) }}</span>
    </p>

    <p
      v-if="state.missedPlaceIds.length"
      class="results-tray__unreached"
    >
      {{ $t('results.unreachedList', { places: unreachedNames }) }}
    </p>

    <div class="results-tray__actions">
      <button
        v-if="isDaily && state.isComplete"
        type="button"
        class="tile results-tray__secondary"
        @click="share"
      >
        {{ $t('daily.share') }}
      </button>

      <button
        v-if="!isDaily"
        type="button"
        class="tile results-tray__play-again"
        @click="emit('playAgain')"
      >
        {{ $t('results.playAgain') }}
      </button>

      <button
        v-if="!isDaily"
        type="button"
        class="tile results-tray__secondary"
        @click="emit('changeSetup')"
      >
        {{ $t('results.changeSetup') }}
      </button>

      <button
        type="button"
        class="tile results-tray__secondary"
        @click="emit('leave')"
      >
        {{ $t('results.home') }}
      </button>
    </div>

    <p
      class="visually-hidden"
      role="status"
    >
      {{ shareNotice }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.results-tray {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  max-width: 520px;
  max-height: calc(100% - env(safe-area-inset-top, 0px) - 72px);
  margin-inline: auto;
  overflow: hidden auto;
  overscroll-behavior: contain;

  &__title {
    margin: 0;
    overflow-wrap: anywhere;
    font-family: $font-serif;
    font-size: 32px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.01em;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 96px), 1fr));
    gap: 8px;
  }

  &__new-best {
    justify-self: start;
    margin: 0;
    padding: 4px 10px;
    border: 2px solid $color-ink;
    border-radius: 4px;
    background: $color-mustard;
    font-size: 14px;
    font-weight: 800;
  }

  &__stat {
    display: grid;
    gap: 4px;
    padding: 10px 12px 8px;
    box-shadow: 0 3px 0 $color-ink;
    animation: stat-in 360ms cubic-bezier(0.2, 1.15, 0.4, 1) backwards;
    animation-delay: calc(280ms + var(--index) * 90ms);
  }

  &__stat-value {
    font-family: $font-serif;
    font-size: 28px;
    font-weight: 900;
    line-height: 1;

    small {
      font-size: 16px;
    }
  }

  &__stat-label {
    color: $color-muted;
    font-size: 11px;
  }

  &__cells {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__streak {
    display: grid;
    gap: 4px;
    padding: 10px 12px 8px;
    box-shadow: 0 3px 0 $color-ink;
  }

  &__streak-value {
    font-family: $font-serif;
    font-size: 40px;
    font-weight: 900;
    line-height: 1;
  }

  &__cells--daily {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 3px;

    .result-cell {
      width: auto;
      min-width: 0;
    }
  }

  &__cells--perfect {
    padding: 6px;
    border: 2px solid $color-ink;
    border-radius: 4px;
    background: $color-gold;
  }

  &__perfect {
    justify-self: start;
    margin: 0;
    font-size: 14px;
    font-weight: 800;
  }

  &__time,
  &__unreached {
    margin: 0;
    color: $color-muted;
    font-size: 14px;
    overflow-wrap: anywhere;
  }

  &__actions {
    display: grid;
    gap: 8px;
  }

  &__play-again,
  &__secondary {
    min-height: 52px;
    font-family: $font-serif;
    font-size: 20px;
    font-weight: 800;
  }

  &__play-again {
    background: $color-green;
    color: $color-surface;
  }
}

.result-cell {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 2px solid $color-ink;
  border-radius: 4px;
  color: $color-surface;
  font-size: 16px;
  font-weight: 800;
  animation: cell-flip 320ms ease-out backwards;
  animation-delay: calc(520ms + var(--index) * 40ms);

  &--right {
    background: $color-green;
  }

  &--wrong {
    background: $color-brick;
  }

  &--missed {
    background: $color-sand;
    color: $color-ink;
  }
}

@keyframes stat-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}

@keyframes cell-flip {
  from { transform: rotateX(90deg); }
}

@media (prefers-reduced-motion: reduce) {
  .results-tray__stat,
  .result-cell {
    animation: none;
  }
}
</style>
