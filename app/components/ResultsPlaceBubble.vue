<script setup lang="ts">
import type { ReportOutcome } from '#shared/game/results-report';

defineProps<{ placeName: string, outcome: ReportOutcome | null, tag?: string, lines: string[] }>();
const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const element = useTemplateRef<HTMLElement>('element');
const { height } = useElementSize(element, undefined, { box: 'border-box' });
// From layout, not the on-screen rect: the bubble rises with the sheet, and a rect read mid-rise would stick.
const bottom = computed(() => (height.value ? (element.value?.offsetTop ?? 0) + height.value : 0));

defineExpose({ bottom, layoutBottom: () => (element.value ? element.value.offsetTop + element.value.offsetHeight : 0) });
</script>

<template>
  <section
    ref="element"
    class="results-bubble"
    role="group"
    :aria-labelledby="titleId"
  >
    <div class="results-bubble__head">
      <span
        v-if="outcome"
        class="results-bubble__swatch"
        :class="`results-bubble__swatch--${outcome}`"
        aria-hidden="true"
      />

      <h3
        :id="titleId"
        class="results-bubble__title"
      >
        {{ placeName }}
      </h3>

      <span
        v-if="tag"
        class="results-bubble__tag"
      >{{ tag }}</span>

      <button
        type="button"
        class="results-bubble__close"
        :aria-label="$t('stats.bubble.closeDetails')"
        @click="emit('close')"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            stroke-width="2.8"
            stroke-linecap="square"
          />
        </svg>
      </button>
    </div>

    <p
      v-for="line in lines"
      :key="line"
      class="results-bubble__line"
    >
      {{ line }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.results-bubble {
  position: absolute;
  z-index: 2;
  top: calc(env(safe-area-inset-top, 0px) + 10px);
  right: calc(env(safe-area-inset-right, 0px) + 10px);
  left: calc(env(safe-area-inset-left, 0px) + 10px);
  max-width: 500px;
  margin-inline: auto;
  padding: 10px 12px 12px;
  border: 2px solid $color-ink;
  border-radius: 6px;
  background: $color-surface;
  box-shadow: 0 4px 0 $color-ink;
  pointer-events: auto;

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  &__swatch {
    flex: none;
    width: 16px;
    height: 16px;
    border: 2px solid $color-ink;
    border-radius: 3px;

    &--right {
      background: $color-green;
    }

    &--wrong {
      background: repeating-linear-gradient(135deg, $color-brick 0 3px, $color-ink 3px 4px);
    }

    &--missed,
    &--unreached {
      background: repeating-linear-gradient(135deg, $color-sand 0 3px, $color-brick 3px 4px);
    }
  }

  &__title {
    flex: 1;
    margin: 0;
    font-family: $font-serif;
    font-size: 22px;
    font-weight: 900;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }

  &__tag {
    flex: none;
    padding: 3px 7px;
    border: 2px solid $color-ink;
    border-radius: 4px;
    background: $color-mustard;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  &__close {
    display: grid;
    flex: none;
    place-items: center;
    width: 44px;
    height: 44px;
    margin: -8px -8px -8px 0;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    cursor: pointer;
    touch-action: manipulation;
  }

  &__line {
    margin: 0;
    font-size: 14px;
    line-height: 1.4;
  }
}
</style>
