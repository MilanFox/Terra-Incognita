<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 22 });
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <path
      d="M5 20V12M12 20V5M19 20v-6"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="square"
    />
  </svg>
</template>
