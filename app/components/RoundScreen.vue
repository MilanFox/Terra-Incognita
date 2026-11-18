<script setup lang="ts">
import { isTypedMode, pausesPerRound } from '#shared/game/game';
import type { GameState, ProgressCell } from '#shared/game/game';
import { useDurationText } from '~/composables/useDurationText';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'prompt' | 'verdict' }>, fade: number, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ next: [], dontKnow: [], zoomIn: [], zoomOut: [] }>();

const { locale, t } = useI18n();
const game = useGameStore();
const durationTextOf = useDurationText();

const cellMarks: Record<ProgressCell, string> = { right: '✓', wrong: '✗', missed: '–', current: '', pending: '' };

const clockText = computed(() => (game.timeLeftMs === null ? null : durationTextOf(Math.ceil(game.timeLeftMs / 1000))));

const isArrivingAfterRight = computed(() => props.state.phase === 'prompt' && props.state.progress[props.state.promptNumber - 2] === 'right');

const isTyped = computed(() => isTypedMode(props.state.setup.mode));
const isNameShown = computed(() => props.state.setup.variant === 'name' || props.state.setup.variant === 'both' || props.state.phase === 'verdict');
const isFlagShown = computed(() => props.state.setup.variant === 'flag' || props.state.setup.variant === 'both');
const isRetrying = computed(() => props.state.phase === 'prompt' && props.state.wrongTapPlaceIds.length > 0);
const isAmbiguous = computed(() => props.state.phase === 'prompt' && props.state.unresolvedAnswers.at(-1) === 'ambiguous');

const kickerText = computed(() => {
  const { state } = props;
  if (state.phase === 'verdict') return state.answer.outcome === 'missed' ? t('typed.missed') : t(`round.${state.answer.outcome}`);
  if (isRetrying.value) return t('round.triesLeft', { count: state.attemptsLeft }, state.attemptsLeft);
  return isTyped.value ? t('typed.prompt') : t('round.findPrompt');
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

const placeName = (placeId: string) => game.nameOf(placeId, locale.value);
</script>

<template>
  <div
    class="round-screen"
    :inert="state.isPaused"
  >
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
        :key="state.promptNumber"
        class="tile prompt-card"
        :class="[state.phase === 'verdict' && `prompt-card--${state.answer.outcome}`, isArrivingAfterRight && 'prompt-card--arriving']"
        :style="{ '--fade': fade }"
      >
        <p class="kicker prompt-card__kicker">
          {{ kickerText }}
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

        <p
          v-if="isAmbiguous"
          class="prompt-card__retype"
        >
          {{ $t('typed.ambiguous') }}
        </p>

        <button
          v-if="state.phase === 'prompt' && isTyped"
          type="button"
          class="prompt-card__dont-know"
          @click="emit('dontKnow')"
        >
          {{ $t('typed.dontKnow') }}
        </button>

        <template v-if="state.phase === 'verdict'">
          <i18n-t
            v-if="state.answer.outcome === 'wrong'"
            :keypath="state.setup.easy && isTyped ? 'choice.youPicked' : isTyped ? 'typed.youTyped' : 'round.youTapped'"
            tag="p"
            class="prompt-card__tapped"
            scope="global"
          >
            <template #place>
              <s>{{ placeName(state.answer.tappedPlaceId) }}</s>
            </template>
          </i18n-t>

          <button
            v-if="state.answer.outcome !== 'right'"
            type="button"
            class="tile prompt-card__next"
            @click="emit('next')"
          >
            {{ $t('round.next') }}
          </button>
        </template>
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
          {{ $t('endRound.line') }}
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

  &__progress {
    flex: 1 1 96px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
    min-height: 44px;
    padding: 6px;
    box-shadow: 0 3px 0 $color-ink;
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

  &--missed {
    background: $color-sand;
    color: $color-ink;
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

  &--missed {
    background: $color-sand;
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

  &__retype {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }

  &__dont-know {
    justify-self: end;
    min-height: 44px;
    margin: 0 -8px -10px 0;
    padding: 0 8px;
    border: 0;
    background: none;
    font-size: 15px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
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
