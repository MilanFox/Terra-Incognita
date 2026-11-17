<script setup lang="ts">
import type { Mode, RoundSetup } from '#shared/game/game';
import { useRightAnswerFade } from '~/composables/useRightAnswerFade';
import { useStartupRevealed } from '~/composables/useStartupRevealed';
import { useGameStore } from '~/stores/game';
import { useHomeDrift } from '~/composables/useHomeDrift';
import { usePlayFeedback } from '~/composables/usePlayFeedback';

const isStartupRevealed = useStartupRevealed();
const isMapDrawn = ref(false);
const homeSelectedPlaceId = ref<string | null>(null);
const game = useGameStore();
const worldMap = useTemplateRef('worldMap');
const homeTray = useTemplateRef('homeTray');
const setupTray = useTemplateRef('setupTray');
const answerFade = useRightAnswerFade();
const setupDraft = ref<RoundSetup | null>(null);
const { height: setupTrayHeight } = useElementSize(() => setupTray.value?.element);
const isSettingsOpen = ref(false);

usePlayFeedback(() => game.state);

const isShellReady = computed(() => isStartupRevealed.value && game.isReady);
const isHomeDrifting = computed(() => isMapDrawn.value && game.state.phase === 'home' && !setupDraft.value);
const { stopForVisit: stopDrift } = useHomeDrift(() => worldMap.value?.getMap(), isHomeDrifting);

const selectedPlaceId = computed(() => game.state.phase === 'home' ? homeSelectedPlaceId.value : null);

const shownTier = computed(() => setupDraft.value?.tier ?? (game.state.phase === 'home' ? 'sovereign' : game.state.setup.tier));
const poolPlaceIds = computed(() => setupDraft.value ? game.poolOf(setupDraft.value) : null);
const frameRegion = computed(() => setupDraft.value?.region ?? (game.state.phase === 'home' ? 'world' : game.state.setup.region));

const verdict = computed(() => game.state.phase === 'verdict' ? game.state.answer : null);

const handleTap = (placeId?: string) => {
  if (game.state.phase !== 'home') game.send({ type: 'tap', placeId });
  else if (placeId) homeSelectedPlaceId.value = placeId;
};

const openSetup = (mode: Mode) => {
  homeSelectedPlaceId.value = null;
  setupDraft.value = game.setupFor(mode);
};

const closeSetup = async () => {
  setupDraft.value = null;
  await nextTick();
  homeTray.value?.focus();
};

const play = (setup: RoundSetup | undefined) => {
  homeSelectedPlaceId.value = null;
  setupDraft.value = null;
  if (setup) game.play(setup);
  worldMap.value?.focus();
};

const next = () => {
  game.send({ type: 'next' });
  worldMap.value?.focus();
};

const closeSettings = async () => {
  isSettingsOpen.value = false;
  await nextTick();
  homeTray.value?.focusSettings();
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
        v-if="isShellReady && game.state.phase === 'home' && !setupDraft && !isSettingsOpen"
        ref="homeTray"
        :last-setup="game.lastSetup"
        @play-again="play(game.lastSetup)"
        @open-setup="openSetup"
        @settings="isSettingsOpen = true"
        @interact="stopDrift"
      />
    </Transition>

    <Transition name="tray">
      <SetupTray
        v-if="isShellReady && game.state.phase === 'home' && setupDraft"
        ref="setupTray"
        v-model:setup="setupDraft"
        @play="play(setupDraft)"
        @close="closeSetup"
      />
    </Transition>

    <Transition name="drop">
      <RoundScreen
        v-if="isShellReady && (game.state.phase === 'prompt' || game.state.phase === 'verdict')"
        :state="game.state"
        :fade="answerFade"
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

    <Transition name="tray">
      <SettingsTray
        v-if="isShellReady && game.state.phase === 'home' && isSettingsOpen"
        @close="closeSettings"
      />
    </Transition>

    <WorldMap
      ref="worldMap"
      :selected-place-id="selectedPlaceId"
      :verdict="verdict"
      :fade="answerFade"
      :tier="shownTier"
      :pool-place-ids="poolPlaceIds"
      :frame-region="frameRegion"
      :frame-inset="setupDraft ? setupTrayHeight : 0"
      :inert="!!setupDraft || isSettingsOpen"
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
