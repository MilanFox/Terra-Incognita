<script setup lang="ts">
import type { Mode } from '#shared/game/game';

defineProps<{ mode: Mode }>();
</script>

<template>
  <svg
    viewBox="0 0 32 32"
    width="30"
    height="30"
    aria-hidden="true"
  >
    <template v-if="mode === 'name'">
      <path
        d="M8 3l10 1 7 6-2 7-9 1-7-6z"
        fill="currentColor"
      />

      <rect
        x="3.5"
        y="21.5"
        width="25"
        height="8"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      />

      <path
        d="M8.5 23.5v4"
        stroke="currentColor"
        stroke-width="2.5"
      />
    </template>

    <template v-else>
      <path
        d="M16 3a9 9 0 0 0-9 9c0 6.5 9 17 9 17s9-10.5 9-17a9 9 0 0 0-9-9z"
        fill="currentColor"
      />

      <circle
        class="mode-glyph__pin-dot"
        cx="16"
        cy="12"
        r="3.4"
      />
    </template>
  </svg>
</template>

<style scoped lang="scss">
.mode-glyph__pin-dot {
  fill: $color-ink;
}
</style>
