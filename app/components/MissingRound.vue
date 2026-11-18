<script setup lang="ts">
import { gapCount } from '#shared/game/missing';
import { pausesPerRound } from '#shared/game/game';
import type { GameState } from '#shared/game/game';
import { useDurationText } from '~/composables/useDurationText';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'missing' }>, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ zoomIn: [], zoomOut: [] }>();

const { locale } = useI18n();
const game = useGameStore();
const durationTextOf = useDurationText();

const clockText = computed(() => (game.timeLeftMs === null ? null : durationTextOf(Math.ceil(game.timeLeftMs / 1000))));
const isPauseDisabled = computed(() => props.state.pausesLeft === 0);
const placeName = (placeId: string) => game.nameOf(placeId, locale.value);

const endLineId = useId();
const isConfirming = computed(() => props.state.isConfirmingEnd);
const keepPlayingTile = useTemplateRef<HTMLButtonElement>('keepPlayingTile');
const closeTile = useTemplateRef<HTMLButtonElement>('closeTile');
const pauseTile = useTemplateRef<HTMLButtonElement>('pauseTile');
let focusBeforePause: HTMLElement | null = null;

watch(isConfirming, async (confirming) => {
  await nextTick();
  if (confirming) keepPlayingTile.value?.focus();
});

watch(() => props.state.isPaused, (isPaused) => {
  if (isPaused) focusBeforePause = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
});

const keepPlaying = async () => {
  game.send({ type: 'keepPlaying' });
  await nextTick();
  closeTile.value?.focus();
};

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
</script>

<template>
  <div
    class="missing-round"
    :inert="state.isPaused"
  >
    <div class="missing-hud">
      <div
        class="tile missing-hud__progress"
        role="img"
        :aria-label="$t('missing.score', { found: state.foundPlaceIds.length, total: gapCount })"
      >
        <span
          v-for="gapPlaceId in state.gapPlaceIds"
          :key="gapPlaceId"
          class="progress-cell"
          :class="state.foundPlaceIds.includes(gapPlaceId) && 'progress-cell--right'"
        >{{ state.foundPlaceIds.includes(gapPlaceId) ? '✓' : '' }}</span>
      </div>

      <div
        class="tile missing-hud__score"
        role="img"
        :aria-label="$t('missing.foundCount', { found: state.foundPlaceIds.length })"
      >
        <span aria-hidden="true">{{ state.foundPlaceIds.length }}<small>/{{ gapCount }}</small></span>
      </div>

      <div
        v-if="clockText"
        class="tile missing-hud__clock"
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
        class="tile missing-hud__pause"
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
        mode="missing"
        :is-timed="state.setup.timed"
      />

      <button
        ref="closeTile"
        type="button"
        class="tile missing-hud__end"
        :class="isConfirming && 'missing-hud__end--active'"
        :aria-label="$t('endRound.open')"
        @click="isConfirming ? keepPlaying() : game.send({ type: 'askEnd' })"
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
      v-if="!isConfirming"
      :key="state.lastTap ? `${state.foundPlaceIds.length}-${state.tapsLeft}` : 'prompt'"
      class="tile missing-card"
      :class="state.lastTap && `missing-card--${state.lastTap.kind}`"
    >
      <template v-if="state.lastTap?.kind === 'hit'">
        <p class="kicker">
          {{ $t('missing.found') }}
        </p>

        <p class="missing-card__place">
          {{ placeName(state.lastTap.placeId) }}
        </p>
      </template>

      <template v-else-if="state.lastTap">
        <p class="kicker">
          {{ $t('missing.notHere') }}
        </p>

        <p class="missing-card__place">
          {{ state.lastTap.kind === 'sea' ? $t('missing.sea') : $t('missing.youTapped', { place: placeName(state.lastTap.placeId) }) }}
        </p>
      </template>

      <p
        v-else
        class="missing-card__place"
      >
        {{ $t('missing.prompt') }}
      </p>

      <p class="missing-card__taps">
        {{ $t('missing.taps', { count: state.tapsLeft }, state.tapsLeft) }}
      </p>
    </div>

    <div
      v-else
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
        {{ $t('missing.endLine') }}
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
.missing-round {
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

.missing-hud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  :deep(.help-tile) {
    width: 36px;
  }

  &__score,
  &__clock {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    box-shadow: 0 3px 0 $color-ink;
    font-family: $font-serif;
    font-weight: 900;
    line-height: 1;
  }

  &__score {
    min-width: 64px;
    font-size: 24px;

    small {
      font-size: 14px;
      font-weight: 700;
    }
  }

  &__progress {
    flex: 1 1 96px;
    display: flex;
    align-items: center;
    gap: 3px;
    min-height: 44px;
    padding: 6px;
    box-shadow: 0 3px 0 $color-ink;
  }

  &__clock {
    min-width: 56px;
    font-size: 20px;
    font-variant-numeric: tabular-nums;
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

  &--right {
    background: $color-green;
  }
}

.missing-card {
  display: grid;
  gap: 4px;
  padding: 12px 16px 14px;

  &--hit {
    background: $color-green;
    color: $color-surface;
  }

  &--wrong {
    background: $color-brick;
    color: $color-surface;
  }

  &--sea {
    background: $color-sand;
  }

  &__taps {
    font-size: 15px;
    font-weight: 700;
  }

  &__place {
    margin: 0;
    font-family: $font-serif;
    font-size: 28px;
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: -0.01em;
  }

  p {
    margin: 0;
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
</style>
