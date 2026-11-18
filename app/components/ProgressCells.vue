<script setup lang="ts">
import type { ProgressCell } from '#shared/game/game';

defineProps<{ cells: ProgressCell[], label: string }>();

const cellMarks: Record<ProgressCell, string> = { right: '✓', wrong: '✗', missed: '–', current: '', pending: '' };
</script>

<template>
  <div
    class="tile progress-cells"
    role="img"
    :aria-label="label"
  >
    <span
      v-for="(cell, index) in cells"
      :key="index"
      class="progress-cell"
      :class="`progress-cell--${cell}`"
    >{{ cellMarks[cell] }}</span>
  </div>
</template>

<style scoped lang="scss">
.progress-cells {
  flex: 1 1 96px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  min-height: 44px;
  padding: 6px;
  box-shadow: 0 3px 0 $color-ink;
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
</style>
