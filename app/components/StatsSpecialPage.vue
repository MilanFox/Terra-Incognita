<script setup lang="ts">
import type { Mode } from '#shared/game/game';
import type { ModeStats } from '#shared/game/stats';
import { useDurationText } from '~/composables/useDurationText';

const props = defineProps<{ mode: Mode, stats: ModeStats, moreId: string, isExpanded: boolean }>();

const { t, locale } = useI18n();
const durationTextOf = useDurationText();
const page = useTemplateRef('page');

const percentOf = (share: number) => new Intl.NumberFormat(locale.value, { style: 'percent' }).format(share);

// eslint-disable-next-line no-unused-vars
type Format = (value: number) => string;

const valueTile = (label: string, value: number | null, format: Format) => value === null
  ? { label, value: t('stats.noAverage'), spokenValue: t('stats.noAverageSpoken') }
  : { label, value: format(value) };

const tiles = computed(() => {
  const isWayfinder = props.mode === 'wayfinder';
  const { completeRounds, best, averageShare, averageRoutes, fastestPerfectMs } = props.stats;
  const routesOf = (routes: number) => t('stats.routes', { count: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(routes) }, routes === 1 ? 1 : 2);
  const fastestPerfect = fastestPerfectMs === null ? null : durationTextOf(Math.round(fastestPerfectMs / 1000));
  return [
    { label: t('stats.completeRounds'), value: String(completeRounds) },
    valueTile(t('stats.best'), best, isWayfinder ? routesOf : percentOf),
    isWayfinder ? valueTile(t('stats.averageLast20'), averageRoutes, routesOf) : valueTile(t('stats.averageLast20'), averageShare, percentOf),
    ...isWayfinder
      ? []
      : [fastestPerfect
          ? { label: t('stats.fastestPerfect'), value: fastestPerfect.shown, spokenValue: fastestPerfect.spoken }
          : { label: t('stats.fastestPerfect'), value: t('stats.noAverage'), spokenValue: t('stats.noAverageSpoken') }],
  ];
});

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
    :has-heatmap="false"
  >
    <StatsRoundLists
      :mode="mode"
      :bests="stats.bests"
      :last-rounds="stats.lastRounds"
    />
  </StatsPage>
</template>
