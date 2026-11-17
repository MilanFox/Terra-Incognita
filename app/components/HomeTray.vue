<script setup lang="ts">
const emit = defineEmits<{ play: [] }>();

const subtitleId = useId();
const modeTile = useTemplateRef<HTMLButtonElement>('modeTile');

defineExpose({ focus: () => modeTile.value?.focus() });
</script>

<template>
  <section
    class="tray home-tray"
    :aria-label="$t('home.label')"
  >
    <button
      ref="modeTile"
      type="button"
      class="tile mode-tile"
      :aria-label="$t('modes.find.name')"
      :aria-describedby="subtitleId"
      @click="emit('play')"
    >
      <span
        class="mode-tile__glyph"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 32 32"
          width="30"
          height="30"
        >
          <path
            d="M16 3a9 9 0 0 0-9 9c0 6.5 9 17 9 17s9-10.5 9-17a9 9 0 0 0-9-9z"
            fill="currentColor"
          />

          <circle
            class="mode-tile__pin-dot"
            cx="16"
            cy="12"
            r="3.4"
          />
        </svg>
      </span>

      <span class="mode-tile__text">
        <span class="mode-tile__name">{{ $t('modes.find.name') }}</span>

        <span
          :id="subtitleId"
          class="mode-tile__subtitle"
        >{{ $t('modes.find.subtitle') }}</span>
      </span>
    </button>
  </section>
</template>

<style scoped lang="scss">
.mode-tile {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 92px;
  padding: 14px 14px 14px 12px;
  background: $color-mustard;
  text-align: left;

  &__glyph {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 4px;
    background: $color-ink;
    color: $color-mustard;
  }

  &__pin-dot {
    fill: $color-ink;
  }

  &__text {
    display: grid;
    gap: 4px;
  }

  &__name {
    font-family: $font-serif;
    font-size: 26px;
    font-weight: 800;
    line-height: 1;
  }

  &__subtitle {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.25;
  }
}
</style>
