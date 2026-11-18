<script setup lang="ts">
import { dailyDeckSize } from '#shared/game/daily';
import type { DailyVariant } from '#shared/game/game';

defineProps<{ variant: DailyVariant }>();
const emit = defineEmits<{ 'update:variant': [variant: DailyVariant], 'play': [], 'close': [] }>();

const { t } = useI18n();

const titleId = useId();
const lineId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const title = useTemplateRef<HTMLHeadingElement>('title');

const variantOptions = computed(() => (['name', 'flag'] as const).map((value) => {
  const label = t(`setup.variants.${value}`);
  return value === 'flag'
    ? { value, label, detail: t('daily.hard'), accessibleName: t('daily.hardOptionName', { name: label }), isAvailable: true }
    : { value, label, accessibleName: label, isAvailable: true };
}));

const focusableTiles = () => [...tray.value!.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])')];

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') return;
  const tiles = focusableTiles();
  const first = tiles[0]!;
  const last = tiles.at(-1)!;
  const active = document.activeElement;
  const isLeaving = event.shiftKey ? active === first || active === title.value : active === last;
  if (!tray.value!.contains(active) || isLeaving) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
};

onMounted(() => title.value?.focus({ preventScroll: true }));

defineExpose({ element: tray });
</script>

<template>
  <section
    ref="tray"
    class="tray daily-setup-tray"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    :aria-describedby="lineId"
    @keydown="handleKeydown"
  >
    <header class="daily-setup-tray__header">
      <h2
        :id="titleId"
        ref="title"
        class="daily-setup-tray__title"
        tabindex="-1"
      >
        {{ $t('daily.title') }}
      </h2>

      <button
        type="button"
        class="tile daily-setup-tray__close"
        :aria-label="$t('setup.close')"
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
            stroke-width="3"
            stroke-linecap="square"
          />
        </svg>
      </button>
    </header>

    <p
      :id="lineId"
      class="daily-setup-tray__line"
    >
      {{ $t('daily.line') }}
    </p>

    <RadioTiles
      :label="$t('setup.groups.variant')"
      :options="variantOptions"
      :model-value="variant"
      @update:model-value="emit('update:variant', $event as DailyVariant)"
    />

    <button
      type="button"
      class="tile daily-setup-tray__play"
      @click="emit('play')"
    >
      {{ $t('setup.play', { count: dailyDeckSize }, dailyDeckSize) }}
    </button>
  </section>
</template>

<style scoped lang="scss">
.daily-setup-tray {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  max-width: 520px;
  max-height: calc(100% - env(safe-area-inset-top, 0px) - 72px);
  margin-inline: auto;
  overflow-y: auto;
  overscroll-behavior: contain;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  &__title {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    font-family: $font-serif;
    font-size: 26px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.01em;
  }

  &__close {
    display: grid;
    flex: none;
    place-items: center;
    width: 40px;
    height: 40px;
  }

  &__line {
    margin: 0;
    color: $color-muted;
    font-size: 14px;
  }

  &__play {
    width: 100%;
    min-height: 52px;
    background: $color-green;
    color: $color-surface;
    font-family: $font-serif;
    font-size: 20px;
    font-weight: 800;
  }
}
</style>
