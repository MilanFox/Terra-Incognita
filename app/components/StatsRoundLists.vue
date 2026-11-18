<script setup lang="ts">
import { variantChoicesByMode } from '#shared/game/game';
import type { Mode, RegionChoice, Tier, Variant } from '#shared/game/game';
import type { RoundSummary } from '#shared/game/records';
import type { SetupBest } from '#shared/game/stats';
import { useDurationText } from '~/composables/useDurationText';

interface ShownSetup {
  variant: Variant
  region: RegionChoice
  tier: Tier
  easy: boolean
  timed?: boolean
  daily?: boolean
}

const props = defineProps<{ mode: Mode, bests: SetupBest[], lastRounds: RoundSummary[] }>();

const { t, locale } = useI18n();
const durationTextOf = useDurationText();
const bestsHeadingId = useId();
const lastRoundsHeadingId = useId();

const hasVariants = computed(() => variantChoicesByMode[props.mode].length > 1);
const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }));

const isWayfinder = computed(() => props.mode === 'wayfinder');

const setupLine = ({ variant, region, tier, easy, timed, daily }: ShownSetup) => isWayfinder.value
  ? t(easy ? 'setup.easy' : 'stats.bests.normal')
  : [
      daily && t('daily.title'),
      hasVariants.value && t(`setup.variants.${variant}`),
      !daily && t(`setup.regions.${region}`),
      !daily && t(`setup.tiers.${tier}`),
      timed && t('setup.timed'),
      easy && t('setup.easy'),
    ].filter(Boolean).join(' · ');

const scoreOf = (score: number, total: number) => {
  if (isWayfinder.value) {
    const routes = t('stats.routes', { count: score }, score);
    return { shown: routes, spoken: routes };
  }
  return { shown: t('stats.scoreShort', { score, total }), spoken: t('results.scoreText', { score, total }) };
};

const timeOf = (elapsedMs: number) => durationTextOf(Math.round(elapsedMs / 1000));

const bestRows = computed(() => props.bests.map((best) => {
  const fastest = best.fastestPerfectMs === null ? null : timeOf(best.fastestPerfectMs);
  return {
    key: `${best.variant}:${best.region}:${best.tier}:${best.deckSize}:${best.easy}:${best.timed}`,
    setup: setupLine(best),
    score: scoreOf(best.score, best.deckSize),
    time: fastest && { shown: t('stats.bests.perfectIn', { time: fastest.shown }), spoken: t('stats.bests.perfectIn', { time: fastest.spoken }) },
  };
}));

const roundRows = computed(() => props.lastRounds.map(round => ({
  date: dateFormat.value.format(round.date),
  setup: setupLine(round),
  score: scoreOf(round.score, round.deckSize),
  time: timeOf(round.elapsedMs),
  marks: [!round.complete && t('stats.lastRounds.endedEarly'), round.learn && t('stats.lastRounds.learn')].filter(mark => mark !== false),
})));
</script>

<template>
  <section
    v-if="bestRows.length > 0"
    class="round-lists"
    :aria-labelledby="bestsHeadingId"
  >
    <h4
      :id="bestsHeadingId"
      class="kicker round-lists__heading"
    >
      {{ $t('stats.bests.title') }}

      <span class="round-lists__note">· {{ $t('stats.bests.note') }}</span>
    </h4>

    <ul class="round-lists__rows">
      <li
        v-for="row in bestRows"
        :key="row.key"
        class="round-row"
      >
        <span class="round-row__setup">{{ row.setup }}</span>

        <span class="visually-hidden">·</span>

        <span class="round-row__score">
          <span aria-hidden="true">{{ row.score.shown }}</span>

          <span class="visually-hidden">{{ row.score.spoken }}</span>
        </span>

        <template v-if="row.time">
          <span class="visually-hidden">·</span>

          <span class="round-row__time">
            <span aria-hidden="true">{{ row.time.shown }}</span>

            <span class="visually-hidden">{{ row.time.spoken }}</span>
          </span>
        </template>
      </li>
    </ul>
  </section>

  <section
    v-if="roundRows.length > 0"
    class="round-lists"
    :aria-labelledby="lastRoundsHeadingId"
  >
    <h4
      :id="lastRoundsHeadingId"
      class="kicker round-lists__heading"
    >
      {{ $t('stats.lastRounds.title') }}
    </h4>

    <ul class="round-lists__rows">
      <li
        v-for="(row, index) in roundRows"
        :key="index"
        class="round-row round-row--dated"
      >
        <span class="round-row__date">{{ row.date }}</span>

        <span class="visually-hidden">·</span>

        <span class="round-row__setup">{{ row.setup }}</span>

        <span class="visually-hidden">·</span>

        <span class="round-row__score">
          <span aria-hidden="true">{{ row.score.shown }}</span>

          <span class="visually-hidden">{{ row.score.spoken }}</span>
        </span>

        <span class="visually-hidden">·</span>

        <span class="round-row__time">
          <span aria-hidden="true">{{ row.time.shown }}</span>

          <span class="visually-hidden">{{ row.time.spoken }}</span>
        </span>

        <template
          v-for="mark in row.marks"
          :key="mark"
        >
          <span class="visually-hidden">·</span>

          <span class="round-row__mark">{{ mark }}</span>
        </template>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.round-lists {
  display: grid;
  gap: 8px;

  &__heading {
    margin: 0;
    color: $color-muted;
  }

  &__note {
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
  }

  &__rows {
    margin: 0;
    padding: 0;
    border: 2px solid $color-ink;
    border-radius: 6px;
    background: $color-surface;
    list-style: none;
  }
}

.round-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: 2px 10px;
  padding: 9px 10px;
  font-size: 13px;

  & + & {
    border-top: 1.5px solid $color-sand;
  }

  &--dated {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
  }

  &__date {
    min-width: 46px;
    color: $color-muted;
    font-weight: 700;
  }

  &__setup {
    line-height: 1.3;
  }

  &__score {
    font-family: $font-serif;
    font-size: 18px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  &__time {
    color: $color-muted;
    font-variant-numeric: tabular-nums;
  }

  &__mark {
    grid-column: 2 / -1;
    justify-self: start;
    padding: 2px 5px 1px;
    border: 1.5px dashed $color-ink;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
}
</style>
