<script setup lang="ts">
import type { PlaceDetails } from '#shared/game/stats';

const props = defineProps<{ placeName: string, details: PlaceDetails, confusedWithName?: string }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

const titleId = useId();
const element = useTemplateRef<HTMLElement>('element');
const { bottom } = useElementBounding(element);

const lines = computed(() => {
  const { recent, lifetime, easy } = props.details;
  return [
    recent.count > 0 ? t('stats.bubble.recent', { ...recent }) : t('stats.bubble.notPlayed'),
    ...lifetime.total > 0 ? [t('stats.bubble.lifetime', { ...lifetime })] : [],
    ...easy.total > 0 ? [t('stats.bubble.easy', { ...easy })] : [],
    ...props.confusedWithName ? [t('stats.bubble.confusedWith', { name: props.confusedWithName })] : [],
  ];
});

defineExpose({ bottom, lines });
</script>

<template>
  <section
    ref="element"
    class="place-bubble"
    role="group"
    :aria-labelledby="titleId"
  >
    <div class="place-bubble__head">
      <h3
        :id="titleId"
        class="place-bubble__title"
      >
        {{ placeName }}
      </h3>

      <button
        type="button"
        class="place-bubble__close"
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
      v-if="details.rating !== 'noData'"
      class="place-bubble__rating"
    >
      <RatingSwatch :rating="details.rating" />

      {{ $t(`stats.ratings.${details.rating}`) }}
    </p>

    <p
      v-for="line in lines"
      :key="line"
      class="place-bubble__line"
    >
      {{ line }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.place-bubble {
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
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  &__title {
    margin: 2px 0 4px;
    font-family: $font-serif;
    font-size: 22px;
    font-weight: 900;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }

  &__close {
    display: grid;
    flex: none;
    place-items: center;
    width: 44px;
    height: 44px;
    margin: -8px -8px 0 0;
    border-radius: 4px;
  }

  &__rating {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 800;
  }

  &__line {
    margin: 0;
    font-size: 14px;
    line-height: 1.4;
  }
}
</style>
