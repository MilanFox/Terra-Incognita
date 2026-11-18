<script setup lang="ts">
import type { Streak } from '#shared/game/daily';
import type { Region } from '#shared/game/game';
import type { AllGamesStats, RegionCounts } from '#shared/game/stats';
import { shouldShowSafariHint } from '#shared/utils/safariHint';

const props = defineProps<{ stats: AllGamesStats, streak: Streak, moreId: string, isExpanded: boolean, regions: RegionCounts[] }>();
const emit = defineEmits<{ flyToRegion: [region: Region] }>();

const { t } = useI18n();
const more = useTemplateRef<HTMLElement>('more');
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

defineExpose({ more });
</script>

<template>
  <div class="stats-page">
    <h3 class="stats-page__heading">
      <span class="stats-page__name">{{ $t('stats.allGames.name') }}</span>

      <span class="stats-page__subtitle"> · {{ $t('stats.allGames.subtitle') }}</span>
    </h3>

    <div
      v-if="stats.roundsPlayed === 0"
      class="stats-page__empty"
    >
      <p class="stats-page__empty-title">
        {{ $t('stats.empty.title') }}
      </p>

      <p class="stats-page__empty-line">
        {{ $t('stats.empty.line') }}
      </p>
    </div>

    <StatsHeadlineTiles :tiles="tiles" />

    <RatingLegend />

    <p
      v-if="isSafariHintShown"
      class="stats-page__hint"
    >
      {{ $t('stats.safariHint') }}
    </p>

    <div
      :id="moreId"
      ref="more"
      class="stats-page__more"
      :inert="!isExpanded"
    >
      <StatsRegionList
        :regions="regions"
        @fly="emit('flyToRegion', $event)"
      />
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

  &__hint {
    margin: 0;
    color: $color-muted;
    font-size: 14px;
  }

  &__more {
    margin-top: calc(env(safe-area-inset-bottom, 0px) + 6px);
  }
}
</style>
