<script setup lang="ts">
defineProps<{ isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ zoomIn: [], zoomOut: [] }>();
</script>

<template>
  <div class="zoom-tiles">
    <button
      type="button"
      class="tile zoom-tile"
      :aria-label="$t('zoom.in')"
      :aria-disabled="isAtMaxZoom || undefined"
      @click="!isAtMaxZoom && emit('zoomIn')"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
      >
        <path
          d="M12 5v14M5 12h14"
          fill="none"
          stroke="currentColor"
          stroke-width="2.8"
          stroke-linecap="square"
        />
      </svg>
    </button>

    <button
      type="button"
      class="tile zoom-tile"
      :aria-label="$t('zoom.out')"
      :aria-disabled="isAtMinZoom || undefined"
      @click="!isAtMinZoom && emit('zoomOut')"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
      >
        <path
          d="M5 12h14"
          fill="none"
          stroke="currentColor"
          stroke-width="2.8"
          stroke-linecap="square"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped lang="scss">
.zoom-tiles {
  display: grid;
  gap: 8px;
}

.zoom-tile {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;

  &[aria-disabled='true'] {
    border-style: dashed;
    background: $color-paper;
    box-shadow: none;
    color: $color-muted;
  }
}
</style>
