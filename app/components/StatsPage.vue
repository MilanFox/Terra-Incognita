<script setup lang="ts">
import type { HeadlineTile } from '~/components/StatsHeadlineTiles.vue';

withDefaults(defineProps<{ name: string, subtitle: string, isEmpty: boolean, tiles: HeadlineTile[], moreId: string, isExpanded: boolean, hasHeatmap?: boolean }>(), { hasHeatmap: true });

const more = useTemplateRef<HTMLElement>('more');

defineExpose({ more });
</script>

<template>
  <div class="stats-page">
    <h3 class="stats-page__heading">
      <span class="stats-page__name">{{ name }}</span>

      <span class="stats-page__subtitle"> · {{ subtitle }}</span>
    </h3>

    <div
      v-if="isEmpty"
      class="stats-page__empty"
    >
      <p class="stats-page__empty-title">
        {{ $t('stats.empty.title') }}
      </p>

      <p class="stats-page__empty-line">
        {{ $t(hasHeatmap ? 'stats.empty.line' : 'stats.empty.lineWithoutMap') }}
      </p>
    </div>

    <StatsHeadlineTiles :tiles="tiles" />

    <slot name="peek" />

    <div
      :id="moreId"
      ref="more"
      class="stats-page__more"
      :inert="!isExpanded"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.stats-page {
  display: grid;
  gap: 12px;

  &__heading {
    margin: 0;
    line-height: 1.2;
  }

  &__name {
    font-family: $font-serif;
    font-size: 20px;
    font-weight: 900;
  }

  &__subtitle {
    color: $color-muted;
    font-size: 14px;
    font-weight: 500;
  }

  &__empty {
    padding: 10px 12px;
    border: 2px dashed $color-ink;
    border-radius: 6px;
    background: $color-surface;
  }

  &__empty-title {
    margin: 0 0 4px;
    font-family: $font-serif;
    font-size: 18px;
    font-weight: 900;
  }

  &__empty-line {
    margin: 0;
    font-size: 14px;
    line-height: 1.4;
  }

  &__more {
    display: grid;
    gap: 18px;
    margin-top: calc(env(safe-area-inset-bottom, 0px) + 6px);
  }
}
</style>
