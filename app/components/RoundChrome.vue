<script setup lang="ts">
import { pausesPerRound } from '#shared/game/game';
import type { RoundSetup } from '#shared/game/game';
import { useBackStep } from '~/composables/useBackSteps';
import { useDurationText } from '~/composables/useDurationText';
import { useReducedMotion } from '~/composables/useReducedMotion';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: { setup: RoundSetup, isConfirmingEnd: boolean, isPaused?: boolean, pausesLeft?: number }, endLine: string, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ zoomIn: [], zoomOut: [] }>();

const game = useGameStore();
const durationTextOf = useDurationText();

const clockText = computed(() => (game.timeLeftMs === null ? null : durationTextOf(Math.ceil(game.timeLeftMs / 1000))));

const flipOutMs = 140;
const flipInMs = 160;
const isMotionReduced = useReducedMotion();
const isConfirming = computed(() => props.state.isConfirmingEnd);
const shownFace = ref<'card' | 'end'>(isConfirming.value ? 'end' : 'card');
const flipPhase = ref<'out' | 'in' | null>(null);
const root = useTemplateRef<HTMLElement>('root');
const cardFlip = useTemplateRef<HTMLElement>('cardFlip');
const zoomTiles = useTemplateRef<ComponentPublicInstance>('zoomTiles');
const confirmEndTile = useTemplateRef<HTMLButtonElement>('confirmEndTile');
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
  if (isMotionReduced.value) {
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

const isPauseDisabled = computed(() => !props.state.pausesLeft);
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

useBackStep(askEnd);
useBackStep(keepPlaying, () => isConfirming.value);
useBackStep(resume, () => !!props.state.isPaused);

useEventListener(document, 'keydown', (event) => {
  if (event.defaultPrevented || !isConfirming.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    keepPlaying();
  }
  else if (event.key === 'Tab') {
    event.preventDefault();
    (document.activeElement === keepPlayingTile.value ? confirmEndTile.value : keepPlayingTile.value)?.focus();
  }
});

onBeforeUnmount(() => clearTimeout(flipTimer));

defineExpose({ root, cardFlip, zoomTiles: computed(() => zoomTiles.value?.$el as HTMLElement | undefined) });
</script>

<template>
  <div
    ref="root"
    class="round-screen"
    :inert="state.isPaused"
  >
    <div class="round-hud">
      <slot name="hud" />

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
        :inert="isConfirming"
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
        :inert="isConfirming"
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
      ref="cardFlip"
      class="card-flip"
      :class="flipPhase && `card-flip--${flipPhase}`"
    >
      <slot
        name="card"
        :is-shown="shownFace === 'card'"
      />

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
          {{ endLine }}
        </p>

        <div class="end-card__actions">
          <button
            ref="confirmEndTile"
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

    <ZoomTiles
      ref="zoomTiles"
      class="round-zoom"
      :inert="isConfirming"
      :is-at-min-zoom="isAtMinZoom"
      :is-at-max-zoom="isAtMaxZoom"
      @zoom-in="emit('zoomIn')"
      @zoom-out="emit('zoomOut')"
    />

    <PauseScreen
      v-if="state.isPaused"
      :pauses-left="state.pausesLeft ?? 0"
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

  :deep(.tile) {
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

.round-zoom {
  justify-self: end;
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
</style>
