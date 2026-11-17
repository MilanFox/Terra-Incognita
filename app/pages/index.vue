<script setup lang="ts">
import { useStartupRevealed } from '~/composables/useStartupRevealed';

const isStartupRevealed = useStartupRevealed();
const isMapDrawn = ref(false);
const selectedPlaceId = ref<string | null>(null);
</script>

<template>
  <main class="home">
    <WorldMap
      :selected-place-id="selectedPlaceId"
      @drawn="isMapDrawn = true"
      @tap="selectedPlaceId = $event"
    />

    <StartupLoader
      :is-map-drawn="isMapDrawn"
      @revealed="isStartupRevealed = true"
    />
  </main>
</template>

<style scoped lang="scss">
.home {
  position: fixed;
  inset: 0;
}
</style>
