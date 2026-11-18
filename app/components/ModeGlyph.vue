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

    <template v-else-if="mode === 'capital'">
      <path
        d="M16 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5-4.8-4.6 6.6-.9z"
        fill="currentColor"
      />

      <path
        d="M4 28.5h24"
        stroke="currentColor"
        stroke-width="2.5"
      />
    </template>

    <template v-else-if="mode === 'country'">
      <path
        d="M6.5 3v27"
        stroke="currentColor"
        stroke-width="2.5"
      />

      <path
        d="M8 4.5c4.5-2.5 8.5 2.5 13 0 2-1.1 3.5-1.5 5-1.5v14c-1.5 0-3 .4-5 1.5-4.5 2.5-8.5-2.5-13 0z"
        fill="currentColor"
      />
    </template>

    <template v-else-if="mode === 'fill'">
      <rect
        x="4"
        y="4"
        width="10"
        height="10"
        fill="currentColor"
      />

      <rect
        x="18"
        y="18"
        width="10"
        height="10"
        fill="currentColor"
      />

      <rect
        x="18"
        y="4"
        width="10"
        height="10"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-dasharray="3 2.5"
      />

      <rect
        x="4"
        y="18"
        width="10"
        height="10"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-dasharray="3 2.5"
      />
    </template>

    <template v-else-if="mode === 'missing'">
      <path
        d="M3.5 4.5h12v10h-12zM16.5 14.5h12v13h-12z"
        fill="currentColor"
      />

      <path
        d="M17 4.5h11.5v7.5M3.5 17v10.5h10"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-dasharray="3 2.5"
      />
    </template>

    <template v-else-if="mode === 'wayfinder'">
      <circle
        cx="7.5"
        cy="24.5"
        r="4.5"
        fill="currentColor"
      />

      <rect
        x="19.5"
        y="3.5"
        width="9"
        height="9"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-dasharray="3.5 2"
      />

      <path
        d="M11 21l5-5-3-4 6-3"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
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
