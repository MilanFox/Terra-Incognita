<script setup lang="ts">
import type { GameState } from '#shared/game/game';
import { useSound } from '~/composables/useSound';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'wayfinder' }>, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ next: [], zoomIn: [], zoomOut: [] }>();

const { locale, t } = useI18n();
const game = useGameStore();
const sound = useSound();

const flipOutMs = 140;
const flipInMs = 160;

const placeName = (placeId: string) => game.nameOf(placeId, locale.value);

const route = computed(() => props.state.route);

const kickerText = computed(() => {
  if (route.value.outcome === 'complete') return t('wayfinder.complete');
  if (route.value.outcome === 'failed') return t('wayfinder.outOfDetours');
  return t('wayfinder.detoursLeft', { count: props.state.detoursLeft }, props.state.detoursLeft);
});

const rejectionText = computed(() => {
  const rejection = props.state.rejectedEntries.at(-1);
  if (!rejection || rejection.reason === 'none') return null;
  if (rejection.reason === 'ambiguous') return t('typed.ambiguous');
  return t(`wayfinder.rejected.${rejection.reason}`, { place: placeName(rejection.placeId) });
});

watch(() => route.value.outcome, (outcome) => {
  if (outcome === 'complete') sound.right();
  else if (outcome === 'failed') sound.wrong();
});

const prefersReducedMotion = usePreferredReducedMotion();
const isConfirming = computed(() => props.state.isConfirmingEnd);
const shownFace = ref<'card' | 'end'>(isConfirming.value ? 'end' : 'card');
const flipPhase = ref<'out' | 'in' | null>(null);
const root = useTemplateRef<HTMLElement>('root');
const cardFlip = useTemplateRef<HTMLElement>('cardFlip');
const keepPlayingTile = useTemplateRef<HTMLButtonElement>('keepPlayingTile');
const closeTile = useTemplateRef<HTMLButtonElement>('closeTile');
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

useEventListener(document, 'keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || !isConfirming.value) return;
  event.preventDefault();
  keepPlaying();
});

onBeforeUnmount(() => clearTimeout(flipTimer));

const { height: cardHeight } = useElementSize(cardFlip, undefined, { box: 'border-box' });
// Offsets, not the bounding box: the screen drops in with a transform, which a bounding box would catch mid-flight.
const cardBottom = computed(() => (cardHeight.value && root.value && cardFlip.value ? root.value.offsetTop + cardFlip.value.offsetTop + cardHeight.value : 0));

defineExpose({ cardBottom });
</script>

<template>
  <div
    ref="root"
    class="wayfinder-round"
  >
    <div class="wayfinder-round__hud">
      <p class="tile wayfinder-round__route">
        {{ $t('wayfinder.route', { number: state.routeNumber }) }}
      </p>

      <HelpTile mode="wayfinder" />

      <button
        ref="closeTile"
        type="button"
        class="tile wayfinder-round__end"
        :class="isConfirming && 'wayfinder-round__end--active'"
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
      <div
        v-show="shownFace === 'card'"
        :key="state.routeNumber"
        class="tile route-card"
      >
        <p class="kicker">
          {{ kickerText }}
        </p>

        <p class="route-card__title">
          <span
            class="route-card__swatch route-card__swatch--start"
            aria-hidden="true"
          />

          <span>{{ placeName(route.start) }}</span>

          <span aria-hidden="true"> → </span>

          <span class="visually-hidden"> {{ $t('wayfinder.to') }} </span>

          <span
            class="route-card__swatch route-card__swatch--target"
            aria-hidden="true"
          />

          <span>{{ placeName(route.target) }}</span>
        </p>

        <ul
          v-if="route.entries.length"
          class="route-card__chips"
          :aria-label="$t('wayfinder.named')"
        >
          <li
            v-for="placeId in route.entries"
            :key="placeId"
            class="route-card__chip"
          >
            {{ placeName(placeId) }}
          </li>
        </ul>

        <p
          v-if="rejectionText"
          class="route-card__rejected"
        >
          {{ rejectionText }}
        </p>

        <button
          v-if="route.outcome !== 'open'"
          type="button"
          class="tile route-card__next"
          @click="emit('next')"
        >
          {{ $t('round.next') }}
        </button>
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
          {{ $t('wayfinder.endLine') }}
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
      class="wayfinder-round__zoom"
      :inert="isConfirming"
    >
      <button
        type="button"
        class="tile wayfinder-round__zoom-tile"
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
        class="tile wayfinder-round__zoom-tile"
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
  </div>
</template>

<style scoped lang="scss">
.wayfinder-round {
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

  &__hud {
    display: flex;
    gap: 6px;

    :deep(.help-tile) {
      width: 36px;
    }
  }

  &__route {
    flex: 1;
    display: flex;
    align-items: center;
    min-height: 44px;
    margin: 0;
    padding: 0 12px;
    box-shadow: 0 3px 0 $color-ink;
    font-family: $font-serif;
    font-size: 20px;
    font-weight: 900;
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

  &__zoom {
    display: grid;
    gap: 8px;
    justify-self: end;
  }

  &__zoom-tile {
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
}

.route-card {
  display: grid;
  gap: 6px;
  padding: 12px 16px 14px;
  animation: content-in 420ms ease-out;

  &__title {
    margin: 0;
    font-family: $font-serif;
    font-size: 26px;
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -0.01em;
  }

  &__swatch {
    display: inline-block;
    width: 18px;
    height: 18px;
    margin-right: 6px;
    border-radius: 4px;
    vertical-align: -1px;

    &--start {
      border: 2px solid $color-route-start-outline;
      background: $color-route-start;
    }

    &--target {
      border: 3px dashed $color-route-target-outline;
      background: $color-route-target;
    }
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__chip {
    padding: 3px 8px;
    border: 1.5px solid $color-ink;
    border-radius: 4px;
    background: $color-route-named;
    font-size: 15px;
    font-weight: 700;
  }

  &__rejected {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }

  &__next {
    justify-self: end;
    min-height: 48px;
    margin-top: 6px;
    padding: 0 20px;
    font-family: $font-serif;
    font-size: 19px;
    font-weight: 800;
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

@keyframes content-in {
  from { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .route-card {
    animation: none;
  }
}
</style>
