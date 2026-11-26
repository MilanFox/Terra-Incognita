<script setup lang="ts">
import type { Outcome, ProgressCell } from '#shared/game/game';

const props = defineProps<{ progress: ProgressCell[], promptNumber: number }>();

const { t } = useI18n();

const outcomeMarks: Record<Outcome, string> = { right: '✓', wrong: '✗', missed: '–' };

const countOf = (outcome: Outcome) => props.progress.filter(cell => cell === outcome).length;

const outcomeCounts = computed((): Record<Outcome, number> => ({ right: countOf('right'), wrong: countOf('wrong'), missed: countOf('missed') }));

const answeredShare = computed(() => (outcomeCounts.value.right + outcomeCounts.value.wrong + outcomeCounts.value.missed) / props.progress.length);

const label = computed(() => t('round.progressCounts', { current: props.promptNumber, total: props.progress.length, ...outcomeCounts.value }));
</script>

<template>
  <div
    class="tile progress-counts"
    role="img"
    :aria-label="label"
  >
    <div
      class="progress-counts__outcomes"
      aria-hidden="true"
    >
      <span
        v-for="(count, outcome) in outcomeCounts"
        :key="outcome"
        class="progress-counts__outcome"
      >
        <span
          class="progress-counts__mark"
          :class="`progress-counts__mark--${outcome}`"
        >{{ outcomeMarks[outcome] }}</span>{{ count }}
      </span>
    </div>

    <div
      class="progress-counts__position"
      aria-hidden="true"
    >
      <span class="progress-counts__track">
        <span
          class="progress-counts__fill"
          :style="{ width: `${answeredShare * 100}%` }"
        />
      </span>

      <span class="progress-counts__number">{{ promptNumber }}/{{ progress.length }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.progress-counts {
  flex: 1 1 96px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  padding: 5px 8px;
  box-shadow: 0 3px 0 $color-ink;
  font-variant-numeric: tabular-nums;

  &__outcomes {
    display: flex;
    gap: 10px;
  }

  &__outcome {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 14px;
    font-weight: 800;
    line-height: 1;
  }

  &__mark {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border: 1.5px solid $color-ink;
    border-radius: 3px;
    color: $color-surface;
    font-size: 11px;

    &--right {
      background: $color-green;
    }

    &--wrong {
      background: $color-brick;
    }

    &--missed {
      background: $color-sand;
      color: $color-ink;
    }
  }

  &__position {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__track {
    flex: 1;
    height: 6px;
    overflow: hidden;
    border: 1px solid $color-ink;
    border-radius: 2px;
    background: $color-paper;
  }

  &__fill {
    display: block;
    height: 100%;
    background: $color-ink;
  }

  &__number {
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }
}
</style>
