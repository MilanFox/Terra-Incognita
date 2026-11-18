<script setup lang="ts">
import type { Rating } from '#shared/game/stats';

defineProps<{ tiles: { label: string, value: string, spokenValue?: string, note?: string, rating?: Rating }[] }>();
</script>

<template>
  <dl class="headline-tiles">
    <div
      v-for="tile in tiles"
      :key="tile.label"
      class="tile headline-tile"
    >
      <dt class="kicker headline-tile__label">
        <RatingSwatch
          v-if="tile.rating"
          :rating="tile.rating"
        />

        {{ tile.label }}
      </dt>

      <dd class="headline-tile__value">
        <span :aria-hidden="tile.spokenValue ? 'true' : undefined">{{ tile.value }}</span>

        <span
          v-if="tile.spokenValue"
          class="visually-hidden"
        >{{ tile.spokenValue }}</span>

        <span
          v-if="tile.note"
          class="headline-tile__note"
          :aria-hidden="tile.spokenValue ? 'true' : undefined"
        >{{ tile.note }}</span>
      </dd>
    </div>
  </dl>
</template>

<style scoped lang="scss">
.headline-tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.headline-tile {
  display: grid;
  align-content: space-between;
  gap: 4px;
  padding: 8px 10px;

  &__label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: $color-muted;
    font-size: 11px;
  }

  &__value {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 6px;
    margin: 0;
    font-family: $font-serif;
    font-size: 26px;
    font-weight: 900;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  &__note {
    color: $color-muted;
    font-family: $font-sans;
    font-size: 11px;
    font-weight: 600;
  }
}
</style>
