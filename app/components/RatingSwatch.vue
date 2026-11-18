<script setup lang="ts">
import type { Rating } from '#shared/game/stats';

defineProps<{ rating: Rating }>();
</script>

<template>
  <span
    class="rating-swatch"
    :class="`rating-swatch--${rating}`"
    aria-hidden="true"
  />
</template>

<style scoped lang="scss">
.rating-swatch {
  display: inline-block;
  flex: none;
  width: 14px;
  height: 14px;
  border: 1.5px solid $color-ink;
  border-radius: 3px;

  &--noData {
    background: $color-rating-no-data;
  }

  &--weak {
    background: $color-rating-weak;
  }

  &--shaky {
    background: $color-rating-shaky;
  }

  &--solid {
    background: $color-rating-solid;
  }
}
</style>
