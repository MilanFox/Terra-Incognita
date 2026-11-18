<script setup lang="ts">
import { ratingsInRampOrder } from '#shared/game/stats';
</script>

<template>
  <ul
    class="rating-legend"
    :aria-label="$t('stats.legend')"
  >
    <li
      v-for="rating in ratingsInRampOrder"
      :key="rating"
      class="rating-legend__item"
    >
      <RatingSwatch :rating="rating" />

      {{ $t(`stats.ratings.${rating}`) }}
    </li>
  </ul>
</template>

<style scoped lang="scss">
.rating-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  font-weight: 700;

  &__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
}
</style>
