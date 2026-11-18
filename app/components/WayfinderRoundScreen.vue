<script setup lang="ts">
import type { GameState } from '#shared/game/game';
import { useSound } from '~/composables/useSound';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'wayfinder' }>, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ next: [], zoomIn: [], zoomOut: [] }>();

const { locale, t } = useI18n();
const game = useGameStore();
const sound = useSound();

const placeName = (placeId: string) => game.nameOf(placeId, locale.value);

const route = computed(() => props.state.route);

const kickerText = computed(() => {
  if (route.value.outcome === 'complete') return t('wayfinder.complete');
  if (route.value.outcome === 'failed') return t('wayfinder.outOfDetours');
  return t('wayfinder.detoursLeft', { count: props.state.detoursLeft }, props.state.detoursLeft);
});

const revealText = computed(() => {
  const { reveal } = props.state;
  if (!reveal?.shortestRoute) return null;
  if (!reveal.yourRoute) return t('wayfinder.shortest', { shortest: route.value.shortest });
  return t('wayfinder.shortestAndYours', { shortest: route.value.shortest, yours: reveal.yourRoute.length });
});

const chipClassOf = (placeId: string) => {
  const { reveal } = props.state;
  if (!reveal) return null;
  return reveal.yourRoute?.includes(placeId) ? 'route-card__chip--route' : 'route-card__chip--unused';
};

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

const chrome = useTemplateRef('chrome');

const { height: cardHeight } = useElementSize(() => chrome.value?.cardFlip, undefined, { box: 'border-box' });
// Offsets, not the bounding box: the screen drops in with a transform, which a bounding box would catch mid-flight.
const cardBottom = computed(() => {
  const { root, cardFlip } = chrome.value ?? {};
  return cardHeight.value && root && cardFlip ? root.offsetTop + cardFlip.offsetTop + cardHeight.value : 0;
});

defineExpose({ cardBottom });
</script>

<template>
  <RoundChrome
    ref="chrome"
    :state="state"
    :end-line="$t('wayfinder.endLine')"
    :is-at-min-zoom="isAtMinZoom"
    :is-at-max-zoom="isAtMaxZoom"
    @zoom-in="emit('zoomIn')"
    @zoom-out="emit('zoomOut')"
  >
    <template #hud>
      <p class="tile route-tile">
        {{ $t('wayfinder.route', { number: state.routeNumber }) }}
      </p>
    </template>

    <template #card="{ isShown }">
      <div
        v-show="isShown"
        :key="state.routeNumber"
        class="tile route-card"
        :class="route.outcome === 'complete' && 'route-card--complete'"
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
            :class="chipClassOf(placeId)"
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

        <p
          v-if="revealText"
          class="route-card__reveal"
        >
          {{ revealText }}
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
    </template>
  </RoundChrome>
</template>

<style scoped lang="scss">
.route-tile {
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

.route-card {
  display: grid;
  gap: 6px;
  padding: 12px 16px 14px;
  animation: content-in 420ms ease-out;

  &--complete {
    background: $color-route-yours;
    color: $color-ink;
  }

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

    &--route {
      border-color: $color-route-yours-outline;
      background: $color-route-yours;
    }

    &--unused {
      background: $color-route-unused;
    }
  }

  &__reveal {
    margin: 0;
    font-family: $font-serif;
    font-size: 18px;
    font-weight: 800;
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

@keyframes content-in {
  from { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .route-card {
    animation: none;
  }
}
</style>
