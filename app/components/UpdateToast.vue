<script setup lang="ts">
import { useAppUpdate } from '~/composables/useAppUpdate';
import { useGameStore } from '~/stores/game';

const { isUpdateReady, applyUpdate, dismissUpdate } = useAppUpdate();
const game = useGameStore();
</script>

<template>
  <div
    class="update-toast"
    :class="{ 'update-toast--top': game.state.phase === 'results' }"
    role="status"
  >
    <template v-if="isUpdateReady">
      <p class="update-toast__message">{{ $t('update.message') }}</p>

      <button
        type="button"
        class="update-toast__button"
        @click="applyUpdate"
      >
        {{ $t('update.reload') }}
      </button>

      <button
        type="button"
        class="update-toast__button"
        @click="dismissUpdate"
      >
        {{ $t('update.dismiss') }}
      </button>
    </template>
  </div>
</template>

<style scoped lang="scss">
.update-toast {
  position: fixed;
  inset: auto $spacing-md $spacing-md;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $spacing-sm;
  justify-content: space-between;

  &--top {
    inset: calc(env(safe-area-inset-top, 0px) + $spacing-md) $spacing-md auto;
  }

  &:empty {
    display: none;
  }

  &:not(:empty) {
    padding: $spacing-md;
    border-radius: $spacing-sm;
    background: $color-text;
    color: $color-surface;
  }

  &__message {
    margin: 0;
  }

  &__button {
    min-height: 44px;
    padding: 0 $spacing-md;
    border: 2px solid $color-surface;
    border-radius: $spacing-xs;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;

    &:focus-visible {
      outline: 3px solid $color-surface;
      outline-offset: 2px;
    }
  }
}
</style>
