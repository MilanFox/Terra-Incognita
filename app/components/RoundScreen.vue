<script setup lang="ts">
import { isNoMapMode, isTypedMode } from '#shared/game/game';
import type { GameState } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'prompt' | 'verdict' }>, fade: number, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ next: [], dontKnow: [], zoomIn: [], zoomOut: [] }>();

const { locale, t } = useI18n();
const game = useGameStore();

const isArrivingAfterRight = computed(() => props.state.phase === 'prompt' && props.state.progress[props.state.promptNumber - 2] === 'right');

const isTyped = computed(() => isTypedMode(props.state.setup.mode));
const isCapital = computed(() => props.state.setup.mode === 'capital');
const isNoMap = computed(() => isNoMapMode(props.state.setup.mode));
const isNameShown = computed(() => isCapital.value || props.state.setup.variant === 'name' || props.state.setup.variant === 'both' || props.state.phase === 'verdict');
const isFlagShown = computed(() => props.state.setup.variant === 'flag' || props.state.setup.variant === 'both');
const isSilhouetteShown = computed(() => props.state.setup.variant === 'silhouette');
const silhouette = computed(() => (isSilhouetteShown.value ? game.silhouetteOf(props.state.placeId) : null));
const isRetrying = computed(() => props.state.phase === 'prompt' && props.state.wrongTapPlaceIds.length > 0);
const isAmbiguous = computed(() => props.state.phase === 'prompt' && props.state.unresolvedAnswers.at(-1) === 'ambiguous');

const kickerText = computed(() => {
  const { state } = props;
  if (state.phase === 'verdict') return state.answer.outcome === 'missed' ? t('typed.missed') : t(`round.${state.answer.outcome}`);
  if (isRetrying.value) return t('round.triesLeft', { count: state.attemptsLeft }, state.attemptsLeft);
  if (isCapital.value) return t('capital.prompt');
  if (isNoMap.value) return t(`sighting.prompt.${state.setup.variant}`);
  return isTyped.value ? t('typed.prompt') : t('round.findPrompt');
});

watchEffect(() => isSilhouetteShown.value && game.loadOwnLand());

const placeName = (placeId: string) => game.nameOf(placeId, locale.value);
const pickedName = (placeId: string) => (isCapital.value ? game.firstCapitalNameOf(placeId, locale.value) : placeName(placeId));
const capitalNames = (placeId: string) => game.capitalNamesOf(placeId, locale.value);
</script>

<template>
  <RoundChrome
    :state="state"
    :end-line="$t('endRound.line')"
    :is-at-min-zoom="isAtMinZoom"
    :is-at-max-zoom="isAtMaxZoom"
    @zoom-in="emit('zoomIn')"
    @zoom-out="emit('zoomOut')"
  >
    <template #hud>
      <ProgressCells
        :cells="state.progress"
        :label="$t('round.progress', { current: state.promptNumber, total: state.deckSize })"
      />

      <ScoreTile
        :count="state.score"
        :total="state.deckSize"
        :label="$t('round.score', { score: state.score })"
      />
    </template>

    <template #card="{ isShown }">
      <div
        v-show="isShown"
        :key="state.promptNumber"
        class="tile prompt-card"
        :class="[state.phase === 'verdict' && `prompt-card--${state.answer.outcome}`, isArrivingAfterRight && 'prompt-card--arriving', state.phase === 'verdict' && (isFlagShown || isSilhouetteShown) && 'prompt-card--image-beside-name']"
        :style="{ '--fade': fade }"
      >
        <p class="kicker prompt-card__kicker">
          {{ kickerText }}
        </p>

        <img
          v-if="isFlagShown"
          :src="`/data/flags/${state.placeId}.svg`"
          :alt="isNoMap ? $t('sighting.flag') : $t('round.flag')"
          class="prompt-card__flag"
        />

        <svg
          v-if="isSilhouetteShown"
          class="prompt-card__silhouette"
          role="img"
          :aria-label="$t('sighting.silhouette')"
          :viewBox="silhouette ? `0 0 ${silhouette.width.toFixed(2)} ${silhouette.height.toFixed(2)}` : undefined"
        >
          <path
            v-if="silhouette"
            :d="silhouette.path"
          />
        </svg>

        <p
          v-if="isNameShown"
          class="prompt-card__place"
        >
          {{ placeName(state.placeId) }}
        </p>

        <p
          v-if="isCapital && state.phase === 'verdict'"
          class="prompt-card__place"
        >
          {{ $t('capital.answer', { capitals: capitalNames(state.placeId) }) }}
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
            :keypath="state.setup.easy && isTyped ? 'choice.youPicked' : isCapital ? 'capital.youTyped' : isTyped ? 'typed.youTyped' : 'round.youTapped'"
            tag="p"
            class="prompt-card__tapped"
            scope="global"
          >
            <template #place>
              <s>{{ state.setup.easy && isTyped ? pickedName(state.answer.tappedPlaceId) : placeName(state.answer.tappedPlaceId) }}</s>
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
    </template>
  </RoundChrome>
</template>

<style scoped lang="scss">
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

  &--image-beside-name {
    grid-template-columns: auto 1fr;
    align-items: center;
    column-gap: 10px;

    > * {
      grid-column: 1 / -1;
    }

    .prompt-card__flag,
    .prompt-card__silhouette {
      grid-column: 1;
      height: 32px;
      margin-block: 0;
    }

    .prompt-card__place {
      grid-column: 2;
    }
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

  &__silhouette {
    justify-self: start;
    width: auto;
    max-width: 100%;
    height: 140px;
    margin-block: 4px;
    overflow: visible;
    fill: currentColor;
    stroke: currentColor;
    stroke-width: 2px;
    stroke-linejoin: round;

    path {
      vector-effect: non-scaling-stroke;
    }
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
