<script setup lang="ts">
import { gapCount } from '#shared/game/missing';
import type { GameState, ProgressCell } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'missing' }>, isMarked: boolean, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ confirm: [], zoomIn: [], zoomOut: [] }>();

const { locale } = useI18n();
const game = useGameStore();

const gapCells = computed(() => props.state.gapPlaceIds.map((placeId): ProgressCell => (props.state.foundPlaceIds.includes(placeId) ? 'right' : 'pending')));
const placeName = (placeId: string) => game.nameOf(placeId, locale.value);
const shownTap = computed(() => (props.isMarked ? null : props.state.lastTap));
</script>

<template>
  <RoundChrome
    :state="state"
    :end-line="$t('missing.endLine')"
    :is-at-min-zoom="isAtMinZoom"
    :is-at-max-zoom="isAtMaxZoom"
    @zoom-in="emit('zoomIn')"
    @zoom-out="emit('zoomOut')"
  >
    <template #hud>
      <ProgressCells
        :cells="gapCells"
        :label="$t('missing.score', { found: state.foundPlaceIds.length, total: gapCount })"
      />

      <ScoreTile
        :count="state.foundPlaceIds.length"
        :total="gapCount"
        :label="$t('missing.foundCount', { found: state.foundPlaceIds.length })"
      />
    </template>

    <template #card="{ isShown }">
      <div
        v-show="isShown"
        :key="shownTap ? `${state.foundPlaceIds.length}-${state.tapsLeft}` : 'prompt'"
        class="tile missing-card"
        :class="shownTap && `missing-card--${shownTap.kind}`"
      >
        <template v-if="shownTap?.kind === 'hit'">
          <p class="kicker">
            {{ $t('missing.found') }}
          </p>

          <p class="missing-card__place">
            {{ placeName(shownTap.placeId) }}
          </p>
        </template>

        <template v-else-if="shownTap">
          <p class="kicker">
            {{ $t('missing.notHere') }}
          </p>

          <p class="missing-card__place">
            {{ shownTap.kind === 'sea' ? $t('missing.sea') : $t('missing.youTapped', { place: placeName(shownTap.placeId) }) }}
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

        <button
          v-if="isMarked"
          type="button"
          class="tile missing-card__confirm"
          @click="emit('confirm')"
        >
          {{ $t('round.confirm') }}
        </button>
      </div>
    </template>
  </RoundChrome>
</template>

<style scoped lang="scss">
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

  &__confirm {
    justify-self: end;
    min-height: 48px;
    margin-top: 10px;
    padding: 0 20px;
    font-family: $font-serif;
    font-size: 19px;
    font-weight: 800;
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
</style>
