<script setup lang="ts">
import type { Streak } from '#shared/game/daily';
import type { Region } from '#shared/game/game';
import type { AllGamesStats, RegionCounts } from '#shared/game/stats';
import { shouldShowSafariHint } from '#shared/utils/safariHint';

const props = defineProps<{ stats: AllGamesStats, streak: Streak, moreId: string, isExpanded: boolean, regions: RegionCounts[] }>();
const emit = defineEmits<{ flyToRegion: [region: Region] }>();

const { t } = useI18n();
const page = useTemplateRef('page');
const isSafariHintShown = ref(false);

onMounted(() => {
  isSafariHintShown.value = shouldShowSafariHint({ userAgent: navigator.userAgent, isInstalled: matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true });
});

const tiles = computed(() => [
  { label: t('stats.roundsPlayed'), value: String(props.stats.roundsPlayed) },
  { label: t('stats.streak'), value: t('stats.streakValue', { ...props.streak }), spokenValue: t('stats.streakSpoken', { ...props.streak }), note: t('stats.streakNote') },
  { label: t('stats.placesSolid'), value: String(props.stats.placesSolid), rating: 'solid' as const },
  { label: t('stats.placesWeak'), value: String(props.stats.placesWeak), rating: 'weak' as const },
]);

defineExpose({ more: computed(() => page.value?.more ?? null) });
</script>

<template>
  <StatsPage
    ref="page"
    :name="$t('stats.allGames.name')"
    :subtitle="$t('stats.allGames.subtitle')"
    :is-empty="stats.roundsPlayed === 0"
    :tiles="tiles"
    :more-id="moreId"
    :is-expanded="isExpanded"
  >
    <template #peek>
      <RatingLegend />

      <p
        v-if="isSafariHintShown"
        class="stats-hint"
      >
        {{ $t('stats.safariHint') }}
      </p>
    </template>

    <StatsRegionList
      :regions="regions"
      @fly="emit('flyToRegion', $event)"
    />
  </StatsPage>
</template>

<style scoped lang="scss">
.stats-hint {
  margin: 0;
  color: $color-muted;
  font-size: 14px;
}
</style>
