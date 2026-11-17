<script setup lang="ts">
import { useStartupRevealed } from '~/composables/useStartupRevealed';
import { useGameStore } from '~/stores/game';

const isStartupRevealed = useStartupRevealed();
const isMapDrawn = ref(false);
const homeSelectedPlaceId = ref<string | null>(null);
const game = useGameStore();
const worldMap = useTemplateRef('worldMap');
const homeTray = useTemplateRef('homeTray');

const selectedPlaceId = computed(() => {
  const { state } = game;
  if (state.phase === 'home') return homeSelectedPlaceId.value;
  return state.phase === 'verdict' ? state.answer.tappedPlaceId : null;
});

const handleTap = (placeId: string) => {
  if (game.state.phase === 'home') homeSelectedPlaceId.value = placeId;
  else game.send({ type: 'tap', placeId });
};

const play = () => {
  homeSelectedPlaceId.value = null;
  game.play('find');
  worldMap.value?.focus();
};

const next = () => {
  game.send({ type: 'next' });
  worldMap.value?.focus();
};

const leave = async () => {
  game.send({ type: 'leave' });
  await nextTick();
  homeTray.value?.focus();
};

onMounted(game.load);
</script>

<template>
  <main class="home">
    <template v-if="isStartupRevealed && game.isReady">
      <HomeTray
        v-if="game.state.phase === 'home'"
        ref="homeTray"
        @play="play"
      />

      <RoundScreen
        v-else-if="game.state.phase === 'prompt' || game.state.phase === 'verdict'"
        :state="game.state"
        @next="next"
      />

      <ResultsTray
        v-else
        :state="game.state"
        @leave="leave"
      />
    </template>

    <WorldMap
      ref="worldMap"
      :selected-place-id="selectedPlaceId"
      @drawn="isMapDrawn = true"
      @tap="handleTap"
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
