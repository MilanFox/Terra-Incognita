<script setup lang="ts">
import type { GameState, Outcome } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

defineProps<{ state: Extract<GameState, { phase: 'results' }> }>();
const emit = defineEmits<{ leave: [] }>();

const { locale } = useI18n();
const game = useGameStore();

const titleId = useId();
const title = useTemplateRef<HTMLHeadingElement>('title');

const cellMarks: Record<Outcome, string> = { right: '✓', wrong: '✗' };

onMounted(() => title.value?.focus());
</script>

<template>
  <section
    class="tray results-tray"
    :aria-labelledby="titleId"
  >
    <h2
      :id="titleId"
      ref="title"
      class="results-tray__title"
      tabindex="-1"
    >
      {{ $t('results.title') }}
    </h2>

    <div class="tile results-tray__score">
      <span
        class="results-tray__score-value"
        aria-hidden="true"
      >{{ state.score }}<small>/{{ state.deckSize }}</small></span>

      <span class="visually-hidden">{{ $t('results.scoreText', { score: state.score, total: state.deckSize }) }}</span>

      <span
        class="kicker results-tray__score-label"
        aria-hidden="true"
      >{{ $t('results.score') }}</span>
    </div>

    <ol class="results-tray__cells">
      <li
        v-for="answer in state.answers"
        :key="answer.placeId"
        class="result-cell"
        :class="`result-cell--${answer.outcome}`"
      >
        <span aria-hidden="true">{{ cellMarks[answer.outcome] }}</span>

        <span class="visually-hidden">{{ $t(`results.${answer.outcome}`, { place: game.nameOf(answer.placeId, locale) }) }}</span>
      </li>
    </ol>

    <button
      type="button"
      class="tile results-tray__home"
      @click="emit('leave')"
    >
      {{ $t('results.home') }}
    </button>
  </section>
</template>

<style scoped lang="scss">
.results-tray {
  display: grid;
  gap: 16px;

  &__title {
    margin: 0;
    font-family: $font-serif;
    font-size: 32px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.01em;
  }

  &__score {
    justify-self: start;
    display: grid;
    gap: 4px;
    padding: 10px 14px 8px;
    box-shadow: 0 3px 0 $color-ink;
  }

  &__score-value {
    font-family: $font-serif;
    font-size: 28px;
    font-weight: 900;
    line-height: 1;

    small {
      font-size: 16px;
    }
  }

  &__score-label {
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

  &__home {
    min-height: 56px;
    font-family: $font-serif;
    font-size: 20px;
    font-weight: 800;
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

  &--right {
    background: $color-green;
  }

  &--wrong {
    background: $color-brick;
  }
}
</style>
