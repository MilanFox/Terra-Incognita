<script setup lang="ts">
import { pausesPerRound } from '#shared/game/game';
import type { GameState } from '#shared/game/game';
import { useDurationText } from '~/composables/useDurationText';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'fill' }>, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ zoomIn: [], zoomOut: [] }>();

const { locale, t } = useI18n();
const game = useGameStore();
const durationTextOf = useDurationText();

const clockText = computed(() => (game.timeLeftMs === null ? null : durationTextOf(Math.ceil(game.timeLeftMs / 1000))));

const isRejected = computed(() => props.state.lastInput !== null && props.state.lastInput.kind !== 'filled');

const inputLine = computed(() => {
  const { lastInput } = props.state;
  if (!lastInput) return '';
  return t(`fill.input.${lastInput.kind}`, { place: 'placeId' in lastInput ? game.nameOf(lastInput.placeId, locale.value) : '' });
});

const flipOutMs = 140;
const flipInMs = 160;
const prefersReducedMotion = usePreferredReducedMotion();
const isConfirming = computed(() => props.state.isConfirmingEnd);
const shownFace = ref<'card' | 'end'>(isConfirming.value ? 'end' : 'card');
const flipPhase = ref<'out' | 'in' | null>(null);
const keepPlayingTile = useTemplateRef<HTMLButtonElement>('keepPlayingTile');
const closeTile = useTemplateRef<HTMLButtonElement>('closeTile');
const pauseTile = useTemplateRef<HTMLButtonElement>('pauseTile');
const endLineId = useId();
let flipTimer: ReturnType<typeof setTimeout> | undefined;

const showFace = async (face: 'card' | 'end') => {
  shownFace.value = face;
  await nextTick();
  if (face === 'end') keepPlayingTile.value?.focus();
};

watch(isConfirming, (confirming) => {
  const face = confirming ? 'end' : 'card';
  clearTimeout(flipTimer);
  if (prefersReducedMotion.value === 'reduce') {
    showFace(face);
    return;
  }
  flipPhase.value = 'out';
  flipTimer = setTimeout(() => {
    showFace(face);
    flipPhase.value = 'in';
    flipTimer = setTimeout(() => flipPhase.value = null, flipInMs);
  }, flipOutMs);
});

const askEnd = () => game.send({ type: 'askEnd' });

const keepPlaying = async () => {
  game.send({ type: 'keepPlaying' });
  await nextTick();
  closeTile.value?.focus();
};

const isPauseDisabled = computed(() => props.state.pausesLeft === 0);
let focusBeforePause: HTMLElement | null = null;

watch(() => props.state.isPaused, (isPaused) => {
  if (isPaused) focusBeforePause = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
});

const pause = () => {
  if (!isPauseDisabled.value) game.send({ type: 'pause' });
};

const resume = async () => {
  game.send({ type: 'resume' });
  await nextTick();
  (focusBeforePause?.isConnected ? focusBeforePause : pauseTile.value)?.focus();
};

useEventListener(document, 'keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || !isConfirming.value) return;
  event.preventDefault();
  keepPlaying();
});

onBeforeUnmount(() => clearTimeout(flipTimer));
</script>

<template>
  <div
    class="round-screen"
    :inert="state.isPaused"
  >
    <div class="round-hud">
      <div
        class="tile fill-progress"
        role="img"
        :aria-label="$t('fill.progress', { count: state.score, total: state.deckSize })"
        :style="{ '--filled': state.score / state.deckSize }"
      >
        <span class="fill-progress__bar" />
      </div>

      <div
        class="tile round-hud__score"
        role="img"
        :aria-label="$t('fill.score', { count: state.score })"
      >
        <span aria-hidden="true">{{ state.score }}<small>/{{ state.deckSize }}</small></span>
      </div>

      <div
        v-if="clockText"
        class="tile round-hud__clock"
        role="timer"
        aria-live="off"
        :aria-label="$t('round.clock')"
      >
        <span aria-hidden="true">{{ clockText.shown }}</span>

        <span class="visually-hidden">{{ clockText.spoken }}</span>
      </div>

      <button
        v-if="state.setup.timed"
        ref="pauseTile"
        type="button"
        class="tile round-hud__pause"
        :aria-label="$t('pause.open', { count: state.pausesLeft, total: pausesPerRound })"
        :aria-disabled="isPauseDisabled || undefined"
        aria-haspopup="dialog"
        @click="pause"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path
            d="M8 5v14M16 5v14"
            fill="none"
            stroke="currentColor"
            stroke-width="3.5"
          />
        </svg>
      </button>

      <HelpTile
        :mode="state.setup.mode"
        :is-timed="state.setup.timed"
      />

      <button
        ref="closeTile"
        type="button"
        class="tile round-hud__end"
        :class="isConfirming && 'round-hud__end--active'"
        :aria-label="$t('endRound.open')"
        @click="isConfirming ? keepPlaying() : askEnd()"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="square"
          />
        </svg>
      </button>
    </div>

    <div
      class="card-flip"
      :class="flipPhase && `card-flip--${flipPhase}`"
    >
      <div
        v-show="shownFace === 'card'"
        :key="isRejected ? state.inputCount : 'steady'"
        class="tile fill-card"
        :class="isRejected && 'fill-card--rejected'"
      >
        <p class="kicker">
          {{ $t('fill.prompt') }}
        </p>

        <p class="fill-card__line">
          {{ inputLine }}
        </p>
      </div>

      <div
        v-if="shownFace === 'end'"
        class="tile end-card"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="`${endLineId}-title`"
        :aria-describedby="endLineId"
      >
        <h2
          :id="`${endLineId}-title`"
          class="end-card__title"
        >
          {{ $t('endRound.title') }}
        </h2>

        <p
          :id="endLineId"
          class="end-card__line"
        >
          {{ $t('fill.endLine') }}
        </p>

        <div class="end-card__actions">
          <button
            type="button"
            class="tile end-card__confirm"
            @click="game.send({ type: 'end' })"
          >
            {{ $t('endRound.confirm') }}
          </button>

          <button
            ref="keepPlayingTile"
            type="button"
            class="tile end-card__keep"
            @click="keepPlaying"
          >
            {{ $t('endRound.keepPlaying') }}
          </button>
        </div>
      </div>
    </div>

    <div
      class="zoom-tiles"
      :inert="isConfirming"
    >
      <button
        type="button"
        class="tile zoom-tile"
        :aria-label="$t('zoom.in')"
        :aria-disabled="isAtMaxZoom || undefined"
        @click="!isAtMaxZoom && emit('zoomIn')"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.8"
            stroke-linecap="square"
          />
        </svg>
      </button>

      <button
        type="button"
        class="tile zoom-tile"
        :aria-label="$t('zoom.out')"
        :aria-disabled="isAtMinZoom || undefined"
        @click="!isAtMinZoom && emit('zoomOut')"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path
            d="M5 12h14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.8"
            stroke-linecap="square"
          />
        </svg>
      </button>
    </div>

    <PauseScreen
      v-if="state.isPaused"
      :pauses-left="state.pausesLeft"
      @resume="resume"
    />
  </div>
</template>

<style scoped lang="scss">
.round-screen {
  position: absolute;
  z-index: 1;
  inset: calc(env(safe-area-inset-top, 0px) + 10px) calc(env(safe-area-inset-right, 0px) + 10px) auto calc(env(safe-area-inset-left, 0px) + 10px);
  display: grid;
  align-content: start;
  gap: 14px;
  max-height: calc(100% - env(safe-area-inset-top, 0px) - 10px);
  padding-bottom: 6px;
  overflow: hidden auto;
  overscroll-behavior: contain;
  scroll-padding-block: 10px;
  pointer-events: none;

  .tile {
    pointer-events: auto;
  }
}

.round-hud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  :deep(.help-tile) {
    width: 36px;
  }

  &__end {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    min-height: 44px;
    padding: 0;

    &:active {
      transform: none;
      box-shadow: 0 4px 0 $color-ink;
    }

    &--active {
      background: $color-brick;
      color: $color-surface;
    }
  }

  &__score {
    display: flex;
    align-items: baseline;
    justify-content: center;
    min-width: 56px;
    padding: 9px 6px 0;
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

  &__pause {
    display: grid;
    place-items: center;
    width: 36px;
    min-height: 40px;

    &[aria-disabled='true'] {
      border-style: dashed;
      background: $color-paper;
      box-shadow: none;
      color: $color-muted;
      cursor: default;

      &:active {
        transform: none;
      }
    }
  }

  &__clock {
    display: grid;
    place-items: center;
    min-width: 56px;
    padding: 0 6px;
    box-shadow: 0 3px 0 $color-ink;
    font-family: $font-serif;
    font-size: 20px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
}

.zoom-tiles {
  display: grid;
  gap: 8px;
  justify-self: end;
}

.zoom-tile {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;

  &[aria-disabled='true'] {
    border-style: dashed;
    background: $color-paper;
    box-shadow: none;
    color: $color-muted;
  }
}

.card-flip {
  &--out {
    animation: flip-out 140ms ease-in forwards;
  }

  &--in {
    animation: flip-in 160ms ease-out;
  }
}

.end-card {
  display: grid;
  gap: 6px;
  padding: 12px 16px 14px;

  &__title {
    margin: 0;
    font-family: $font-serif;
    font-size: 28px;
    font-weight: 900;
    line-height: 1.02;
  }

  &__line {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  &__confirm,
  &__keep {
    flex: 1 1 140px;
    min-height: 48px;
    font-family: $font-serif;
    font-size: 18px;
    font-weight: 800;
  }

  &__confirm {
    background: $color-brick;
    color: $color-surface;
  }
}

@keyframes flip-out {
  to { transform: rotateX(90deg); }
}

@keyframes flip-in {
  from { transform: rotateX(90deg); }
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

.fill-progress {
  position: relative;
  flex: 1 1 96px;
  min-height: 44px;
  overflow: hidden;
  box-shadow: 0 3px 0 $color-ink;

  &__bar {
    position: absolute;
    inset: 0 auto 0 0;
    width: calc(var(--filled) * 100%);
    background: $color-green;
  }
}

.fill-card {
  display: grid;
  gap: 4px;
  padding: 12px 16px 14px;

  &--rejected {
    background: $color-brick;
    color: $color-surface;
    animation: shake 340ms ease-out;
  }

  &__line {
    min-height: 1.4em;
    margin: 0;
    font-family: $font-serif;
    font-size: 24px;
    font-weight: 900;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fill-card--rejected {
    animation: none;
  }
}
</style>
