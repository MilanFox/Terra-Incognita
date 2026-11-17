<script setup lang="ts">
import type { GameState, ProgressCell } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

defineProps<{ state: Extract<GameState, { phase: 'prompt' | 'verdict' }> }>();
const emit = defineEmits<{ next: [] }>();

const { locale } = useI18n();
const game = useGameStore();

const cellMarks: Record<ProgressCell, string> = { right: '✓', wrong: '✗', current: '', pending: '' };

const placeName = (placeId: string) => game.nameOf(placeId, locale.value);
</script>

<template>
  <div class="round-screen">
    <div class="round-hud">
      <div
        class="tile round-hud__progress"
        role="img"
        :aria-label="$t('round.progress', { current: state.promptNumber, total: state.deckSize })"
      >
        <span
          v-for="(cell, index) in state.progress"
          :key="index"
          class="progress-cell"
          :class="`progress-cell--${cell}`"
        >{{ cellMarks[cell] }}</span>
      </div>

      <div
        class="tile round-hud__score"
        role="img"
        :aria-label="$t('round.score', { score: state.score })"
      >
        <span aria-hidden="true">{{ state.score }}<small>/{{ state.deckSize }}</small></span>
      </div>
    </div>

    <div
      class="tile prompt-card"
      :class="state.phase === 'verdict' && `prompt-card--${state.answer.outcome}`"
    >
      <p class="kicker prompt-card__kicker">
        {{ state.phase === 'verdict' ? $t(`round.${state.answer.outcome}`) : $t('round.findPrompt') }}
      </p>

      <p class="prompt-card__place">{{ placeName(state.placeId) }}</p>

      <template v-if="state.phase === 'verdict'">
        <i18n-t
          v-if="state.answer.outcome === 'wrong'"
          keypath="round.youTapped"
          tag="p"
          class="prompt-card__tapped"
          scope="global"
        >
          <template #place>
            <s>{{ placeName(state.answer.tappedPlaceId) }}</s>
          </template>
        </i18n-t>

        <button
          type="button"
          class="tile prompt-card__next"
          @click="emit('next')"
        >
          {{ $t('round.next') }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.round-screen {
  position: absolute;
  z-index: 1;
  inset: calc(env(safe-area-inset-top, 0px) + 10px) calc(env(safe-area-inset-right, 0px) + 10px) auto calc(env(safe-area-inset-left, 0px) + 10px);
  display: grid;
  gap: 14px;
  pointer-events: none;

  .tile {
    pointer-events: auto;
  }
}

.round-hud {
  display: flex;
  gap: 8px;

  &__progress {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    padding: 6px 8px;
    box-shadow: 0 3px 0 $color-ink;
  }

  &__score {
    display: flex;
    align-items: baseline;
    justify-content: center;
    min-width: 56px;
    padding: 9px 8px 0;
    box-shadow: 0 3px 0 $color-ink;
    font-family: $font-serif;
    font-size: 24px;
    font-weight: 900;
    line-height: 1;

    small {
      font-size: 14px;
      font-weight: 700;
    }
  }
}

.progress-cell {
  flex: 1 1 0;
  display: grid;
  place-items: center;
  min-width: 6px;
  max-width: 24px;
  height: 22px;
  border: 1.5px solid $color-ink;
  border-radius: 3px;
  background: $color-paper;
  color: $color-surface;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;

  &--current {
    border-width: 2.5px;
    background: $color-mustard;
  }

  &--right {
    background: $color-green;
  }

  &--wrong {
    background: $color-brick;
  }
}

.prompt-card {
  display: grid;
  gap: 4px;
  padding: 12px 16px 14px;

  &--right &__kicker {
    color: $color-green;
  }

  &--wrong &__kicker {
    color: $color-brick;
  }

  &__place {
    margin: 0;
    font-family: $font-serif;
    font-size: 32px;
    font-weight: 900;
    line-height: 1.02;
    letter-spacing: -0.01em;
  }

  &__tapped {
    margin: 0;
    font-size: 15px;
    font-weight: 600;

    s {
      text-decoration-thickness: 2px;
    }
  }

  &__next {
    justify-self: end;
    min-height: 48px;
    margin-top: 10px;
    padding: 0 20px;
    font-family: $font-serif;
    font-size: 19px;
    font-weight: 800;
  }
}
</style>
