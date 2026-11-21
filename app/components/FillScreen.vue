<script setup lang="ts">
import type { GameState } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'fill' }>, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ zoomIn: [], zoomOut: [] }>();

const { locale, t } = useI18n();
const game = useGameStore();

const isRejected = computed(() => props.state.lastInput !== null && props.state.lastInput.kind !== 'filled');

const inputLine = computed(() => {
  const { lastInput } = props.state;
  if (!lastInput) return '';
  return t(`fill.input.${lastInput.kind}`, { place: 'placeId' in lastInput ? game.nameOf(lastInput.placeId, locale.value) : '' });
});

const chrome = useTemplateRef('chrome');

defineExpose({ card: computed(() => chrome.value?.cardFlip), zoomTiles: computed(() => chrome.value?.zoomTiles) });
</script>

<template>
  <RoundChrome
    ref="chrome"
    :state="state"
    :end-line="$t('fill.endLine')"
    :is-at-min-zoom="isAtMinZoom"
    :is-at-max-zoom="isAtMaxZoom"
    @zoom-in="emit('zoomIn')"
    @zoom-out="emit('zoomOut')"
  >
    <template #hud>
      <div
        class="tile fill-progress"
        role="img"
        :aria-label="$t('fill.progress', { count: state.score, total: state.deckSize })"
        :style="{ '--filled': state.score / state.deckSize }"
      >
        <span class="fill-progress__bar" />
      </div>

      <ScoreTile
        :count="state.score"
        :total="state.deckSize"
        :label="$t('fill.score', { count: state.score })"
      />
    </template>

    <template #card="{ isShown }">
      <div
        v-show="isShown"
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
    </template>
  </RoundChrome>
</template>

<style scoped lang="scss">
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  18% { transform: translateX(-9px); }
  36% { transform: translateX(8px); }
  54% { transform: translateX(-6px); }
  72% { transform: translateX(4px); }
  88% { transform: translateX(-2px); }
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

.motion-reduced {
  .fill-card--rejected {
    animation: none;
  }
}
</style>
