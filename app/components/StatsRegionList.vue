<script setup lang="ts">
import type { Region } from '#shared/game/game';
import type { RegionCounts } from '#shared/game/stats';

defineProps<{ regions: RegionCounts[] }>();
const emit = defineEmits<{ fly: [region: Region] }>();

const headingId = useId();
</script>

<template>
  <div class="region-list">
    <h4
      :id="headingId"
      class="kicker region-list__heading"
    >
      {{ $t('stats.regionsTitle') }}
    </h4>

    <ul
      class="region-list__rows"
      :aria-labelledby="headingId"
    >
      <li
        v-for="row in regions"
        :key="row.region"
      >
        <button
          type="button"
          class="tile region-list__row"
          @click="emit('fly', row.region)"
        >
          <span class="region-list__name">{{ $t(`setup.regions.${row.region}`) }}</span>

          <span class="region-list__counts">
            <span class="visually-hidden">·</span>

            <span><RatingSwatch rating="weak" />{{ $t('stats.regionWeak', { count: row.weak }) }}</span>

            <span class="visually-hidden">·</span>

            <span><RatingSwatch rating="solid" />{{ $t('stats.regionSolid', { count: row.solid }) }}</span>

            <span class="visually-hidden">·</span>

            <span><RatingSwatch rating="noData" />{{ $t('stats.regionUnplayed', { count: row.unplayed }) }}</span>
          </span>

          <svg
            class="region-list__arrow"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
          >
            <path
              d="M5 12h13M13 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="square"
            />
          </svg>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.region-list {
  display: grid;
  gap: 8px;

  &__heading {
    margin: 0;
    color: $color-muted;
  }

  &__rows {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 2px 8px;
    width: 100%;
    min-height: 56px;
    padding: 8px 10px 8px 12px;
    text-align: left;
  }

  &__name {
    font-family: $font-serif;
    font-size: 18px;
    font-weight: 800;
    line-height: 1.1;
  }

  &__counts {
    display: flex;
    flex-wrap: wrap;
    grid-column: 1;
    gap: 2px 12px;
    color: $color-muted;
    font-size: 13px;
    font-weight: 600;

    :deep(.rating-swatch) {
      width: 10px;
      height: 10px;
      margin-right: 4px;
      vertical-align: -1px;
    }
  }

  &__arrow {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}
</style>
