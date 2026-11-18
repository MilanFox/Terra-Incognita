<script setup lang="ts">
import { variantChoicesByMode } from '#shared/game/game';
import type { Mode, Region, Variant } from '#shared/game/game';
import type { ModeStats, RegionCounts } from '#shared/game/stats';

export type ShownVariant = Variant | 'all';

const props = defineProps<{ mode: Mode, stats: ModeStats, regions: RegionCounts[], moreId: string, isExpanded: boolean }>();
const shownVariant = defineModel<ShownVariant>('shownVariant', { required: true });
const emit = defineEmits<{ flyToRegion: [region: Region] }>();

const { t, locale } = useI18n();
const page = useTemplateRef('page');

const variantOptions = computed(() => {
  const variants = variantChoicesByMode[props.mode];
  if (variants.length < 2) return [];
  return (['all', ...variants] as ShownVariant[]).map((value) => {
    const label = value === 'all' ? t('stats.allVariants') : t(`setup.variants.${value}`);
    return { value, label, accessibleName: label, isAvailable: true };
  });
});

const averageTile = computed(() => {
  const label = t('stats.averageLast20');
  const { averageShare } = props.stats;
  return averageShare === null
    ? { label, value: t('stats.noAverage'), spokenValue: t('stats.noAverageSpoken') }
    : { label, value: new Intl.NumberFormat(locale.value, { style: 'percent' }).format(averageShare) };
});

const tiles = computed(() => [
  { label: t('stats.completeRounds'), value: String(props.stats.completeRounds) },
  averageTile.value,
  { label: t('stats.perfectRounds'), value: String(props.stats.perfectRounds) },
]);

defineExpose({ more: computed(() => page.value?.more ?? null) });
</script>

<template>
  <StatsPage
    ref="page"
    :name="$t(`modes.${mode}.name`)"
    :subtitle="$t(`modes.${mode}.subtitle`)"
    :is-empty="stats.lastRounds.length === 0"
    :tiles="tiles"
    :more-id="moreId"
    :is-expanded="isExpanded"
  >
    <template #peek>
      <RatingLegend />
    </template>

    <RadioTiles
      v-if="variantOptions.length > 0"
      v-model="shownVariant"
      :label="$t('stats.show')"
      :options="variantOptions"
    />

    <StatsRegionList
      :regions="regions"
      @fly="emit('flyToRegion', $event)"
    />

    <StatsRoundLists
      :mode="mode"
      :bests="stats.bests"
      :last-rounds="stats.lastRounds"
    />
  </StatsPage>
</template>
