<script setup lang="ts">
import type { GameState } from '#shared/game/game';
import { useDurationText } from '~/composables/useDurationText';
import { useSound } from '~/composables/useSound';

const props = defineProps<{ state: Extract<GameState, { phase: 'wayfinderResults' }> }>();
const emit = defineEmits<{ playAgain: [], changeSetup: [], leave: [] }>();

const { t } = useI18n();
const sound = useSound();
const durationTextOf = useDurationText();

const resultsLine = computed(() => t('wayfinder.resultsLine', {
  routes: t('wayfinder.routes', { count: props.state.score }, props.state.score),
  withoutDetours: t('wayfinder.withoutDetours', { count: props.state.routesWithoutDetours }, props.state.routesWithoutDetours),
}));

const elapsedTime = computed(() => durationTextOf(Math.round(props.state.elapsedMs / 1000)));

const titleId = useId();
const resultsLineId = useId();
const newBestId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const title = useTemplateRef<HTMLHeadingElement>('title');

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
  sound.results();
});

defineExpose({ element: tray });
</script>

<template>
  <section
    ref="tray"
    class="tray wayfinder-results-tray"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    :aria-describedby="state.isNewBest ? `${resultsLineId} ${newBestId}` : resultsLineId"
    @keydown="handleKeydown"
  >
    <h2
      :id="titleId"
      ref="title"
      class="wayfinder-results-tray__title"
      tabindex="-1"
    >
      {{ state.isComplete ? $t('results.title') : $t('results.titleEnded') }}
    </h2>

    <p
      v-if="state.isNewBest"
      :id="newBestId"
      class="wayfinder-results-tray__new-best"
    >
      {{ state.setup.easy ? $t('wayfinder.newBestEasy') : $t('wayfinder.newBest') }}
    </p>

    <div class="tile wayfinder-results-tray__score">
      <span
        class="wayfinder-results-tray__score-value"
        aria-hidden="true"
      >{{ state.score }}</span>

      <span class="kicker wayfinder-results-tray__score-label">{{ $t('results.score') }}</span>

      <p
        :id="resultsLineId"
        class="wayfinder-results-tray__line"
      >
        {{ resultsLine }}
      </p>
    </div>

    <p class="wayfinder-results-tray__time">
      <span aria-hidden="true">{{ $t('record.time', { time: elapsedTime.shown }) }}</span>

      <span class="visually-hidden">{{ $t('record.time', { time: elapsedTime.spoken }) }}</span>
    </p>

    <div class="wayfinder-results-tray__actions">
      <button
        type="button"
        class="tile wayfinder-results-tray__play-again"
        @click="emit('playAgain')"
      >
        {{ $t('results.playAgain') }}
      </button>

      <button
        type="button"
        class="tile wayfinder-results-tray__secondary"
        @click="emit('changeSetup')"
      >
        {{ $t('results.changeSetup') }}
      </button>

      <button
        type="button"
        class="tile wayfinder-results-tray__secondary"
        @click="emit('leave')"
      >
        {{ $t('results.home') }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.wayfinder-results-tray {
  display: grid;
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

  &__score {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: baseline;
    column-gap: 14px;
    padding: 10px 14px 12px;
    box-shadow: 0 3px 0 $color-ink;
    animation: score-in 360ms cubic-bezier(0.2, 1.15, 0.4, 1) 280ms backwards;
  }

  &__score-value {
    grid-row: span 2;
    font-family: $font-serif;
    font-size: 44px;
    font-weight: 900;
    line-height: 1;
  }

  &__score-label {
    color: $color-muted;
    font-size: 11px;
  }

  &__line {
    margin: 0;
    font-family: $font-serif;
    font-size: 20px;
    font-weight: 800;
    line-height: 1.15;
  }

  &__time {
    margin: 0;
    color: $color-muted;
    font-size: 14px;
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

@keyframes score-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wayfinder-results-tray__score {
    animation: none;
  }
}
</style>
