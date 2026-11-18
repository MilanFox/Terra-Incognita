<script setup lang="ts">
import type { GameState } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'prompt' | 'verdict' }> }>();

const game = useGameStore();
const { locale } = useI18n();

const labelId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const options = useTemplateRef<HTMLButtonElement[]>('options');

const isAnswered = computed(() => props.state.phase === 'verdict');
const pickedPlaceId = computed(() => (props.state.phase === 'verdict' && props.state.answer.outcome !== 'missed' ? props.state.answer.tappedPlaceId : null));

const stateOf = (placeId: string) => {
  if (!isAnswered.value) return null;
  if (placeId === props.state.placeId) return 'right';
  return placeId === pickedPlaceId.value ? 'wrong' : null;
};

const pick = (placeId: string) => {
  if (!isAnswered.value) game.send({ type: 'pick', placeId });
};

defineExpose({
  element: tray,
  focus: () => options.value?.[0]?.focus({ preventScroll: true }),
});
</script>

<template>
  <div
    ref="tray"
    class="tray choice-tray"
    :class="{ 'choice-tray--halted': state.isConfirmingEnd }"
    :inert="state.isConfirmingEnd || state.isPaused"
  >
    <p
      :id="labelId"
      class="kicker choice-tray__label"
    >
      {{ $t('choice.label') }}
    </p>

    <div
      role="group"
      class="choice-tray__options"
      :aria-labelledby="labelId"
    >
      <button
        v-for="(placeId, index) in state.optionPlaceIds"
        :key="index"
        ref="options"
        type="button"
        class="tile choice-tray__option"
        :class="stateOf(placeId) && `choice-tray__option--${stateOf(placeId)}`"
        :aria-disabled="isAnswered"
        @click="pick(placeId)"
      >
        <span :class="{ 'choice-tray__name--struck': stateOf(placeId) === 'wrong' }">{{ game.nameOf(placeId, locale) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.choice-tray {
  display: grid;
  gap: 8px;
  max-width: 520px;
  margin-inline: auto;
  padding: 10px calc(env(safe-area-inset-right, 0px) + 10px) calc(env(safe-area-inset-bottom, 0px) + 14px) calc(env(safe-area-inset-left, 0px) + 10px);
  transition: opacity 150ms ease-out;

  &--halted {
    opacity: 0.45;
  }

  &__label {
    color: $color-muted;
  }

  &__options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  &__option {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 64px;
    padding: 6px 10px;
    font-family: $font-serif;
    font-size: 18px;
    font-weight: 900;
    line-height: 1.15;
    text-align: center;

    &--right {
      background: $color-mustard;
    }

    &--wrong {
      border-color: $color-brick;
      box-shadow: 0 4px 0 $color-brick;
    }

    &[aria-disabled='true'] {
      cursor: default;
    }
  }

  &__name--struck {
    text-decoration: line-through 2px;
  }
}
</style>
