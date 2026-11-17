<script setup lang="ts">
import { useStartupRevealed } from '~/composables/useStartupRevealed';
import { useGameStore } from '~/stores/game';
import { useHomeDrift } from '~/composables/useHomeDrift';

const isStartupRevealed = useStartupRevealed();
const isMapDrawn = ref(false);
const homeSelectedPlaceId = ref<string | null>(null);
const game = useGameStore();
const worldMap = useTemplateRef('worldMap');
const homeTray = useTemplateRef('homeTray');

const isShellReady = computed(() => isStartupRevealed.value && game.isReady);
const isHomeDrifting = computed(() => isMapDrawn.value && game.state.phase === 'home');
const { stopForVisit: stopDrift } = useHomeDrift(() => worldMap.value?.getMap(), isHomeDrifting);

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
    <Transition name="tray">
      <HomeTray
        v-if="isShellReady && game.state.phase === 'home'"
        ref="homeTray"
        @play="play"
        @interact="stopDrift"
      />
    </Transition>

    <Transition name="drop">
      <RoundScreen
        v-if="isShellReady && (game.state.phase === 'prompt' || game.state.phase === 'verdict')"
        :state="game.state"
        @next="next"
      />
    </Transition>

    <Transition name="tray">
      <ResultsTray
        v-if="isShellReady && game.state.phase === 'results'"
        :state="game.state"
        @leave="leave"
      />
    </Transition>

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
