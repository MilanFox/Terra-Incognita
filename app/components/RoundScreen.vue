<script setup lang="ts">
import type { GameState, ProgressCell } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'prompt' | 'verdict' }>, fade: number }>();
const emit = defineEmits<{ next: [] }>();

const { locale } = useI18n();
const game = useGameStore();

const cellMarks: Record<ProgressCell, string> = { right: '✓', wrong: '✗', current: '', pending: '' };

const isArrivingAfterRight = computed(() => props.state.phase === 'prompt' && props.state.progress[props.state.promptNumber - 2] === 'right');

const isNameShown = computed(() => props.state.setup.variant !== 'flag' || props.state.phase === 'verdict');
const isFlagShown = computed(() => props.state.setup.variant !== 'name');
const isRetrying = computed(() => props.state.phase === 'prompt' && props.state.wrongTapPlaceIds.length > 0);

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
      :key="state.promptNumber"
      class="tile prompt-card"
      :class="[state.phase === 'verdict' && `prompt-card--${state.answer.outcome}`, isArrivingAfterRight && 'prompt-card--arriving']"
      :style="{ '--fade': fade }"
    >
      <p class="kicker prompt-card__kicker">
        {{ state.phase === 'verdict' ? $t(`round.${state.answer.outcome}`) : isRetrying ? $t('round.triesLeft', { count: state.attemptsLeft }, state.attemptsLeft) : $t('round.findPrompt') }}
      </p>

      <img
        v-if="isFlagShown"
        :src="`/data/flags/${state.placeId}.svg`"
        alt=""
        class="prompt-card__flag"
      />

      <p
        v-if="isNameShown"
        class="prompt-card__place"
      >
        {{ placeName(state.placeId) }}
      </p>

      <i18n-t
        v-if="state.phase === 'prompt' && isRetrying"
        keypath="round.youTapped"
        tag="p"
        class="prompt-card__tapped"
        scope="global"
      >
        <template #place>
          <s>{{ placeName(state.wrongTapPlaceIds.at(-1)!) }}</s>
        </template>
      </i18n-t>

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
          v-if="state.answer.outcome === 'wrong'"
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

  &--right {
    background: color-mix(in srgb, $color-surface calc(var(--fade) * 100%), $color-green);
    color: $color-surface;
    animation: flip-right 640ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &--right > * {
    opacity: calc(1 - var(--fade));
  }

  &--wrong {
    background: $color-brick;
    color: $color-surface;
    animation: shake 340ms ease-out;
  }

  &--arriving {
    animation: content-in 420ms ease-out;
  }

  &__place {
    margin: 0;
    font-family: $font-serif;
    font-size: 32px;
    font-weight: 900;
    line-height: 1.02;
    letter-spacing: -0.01em;
  }

  &__flag {
    justify-self: start;
    width: auto;
    max-width: 100%;
    height: 72px;
    object-fit: contain;
    margin-block: 4px;
    border: 1.5px solid $color-ink;
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

@keyframes flip-right {
  0% { transform: rotateX(0); }
  45% { transform: rotateX(88deg); }
  100% { transform: none; }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  18% { transform: translateX(-9px); }
  36% { transform: translateX(8px); }
  54% { transform: translateX(-6px); }
  72% { transform: translateX(4px); }
  88% { transform: translateX(-2px); }
}

@keyframes content-in {
  from { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .prompt-card--right,
  .prompt-card--wrong {
    animation: none;
  }
}
</style>
