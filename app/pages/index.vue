<script setup lang="ts">
import type { Mode, RoundSetup } from '#shared/game/game';
import { useRightAnswerFade } from '~/composables/useRightAnswerFade';
import { useStartupRevealed } from '~/composables/useStartupRevealed';
import { useGameStore } from '~/stores/game';
import { useHomeDrift } from '~/composables/useHomeDrift';
import { usePlayFeedback } from '~/composables/usePlayFeedback';
import { useLiveRegion, useRoundAnnouncements } from '~/composables/useLiveRegion';

const isStartupRevealed = useStartupRevealed();
const isMapDrawn = ref(false);
const game = useGameStore();
const worldMap = useTemplateRef('worldMap');
const homeTray = useTemplateRef('homeTray');
const setupTray = useTemplateRef('setupTray');
const resultsTray = useTemplateRef('resultsTray');
const answerFade = useRightAnswerFade();
const setupDraft = ref<RoundSetup | null>(null);
const { height: setupTrayHeight } = useElementSize(() => setupTray.value?.element);
const { height: resultsTrayHeight } = useElementSize(() => resultsTray.value?.element, undefined, { box: 'border-box' });
const isSettingsOpen = ref(false);

usePlayFeedback(() => game.state);

const { message: liveMessage, announce } = useLiveRegion();
useRoundAnnouncements(() => game.state, announce);

const foundPlaceIds = ref<string[]>([]);
watch(() => game.state, (state) => {
  if (state.phase === 'verdict' && state.answer.outcome === 'right') foundPlaceIds.value.push(state.answer.placeId);
  else if (state.phase === 'home' || state.phase === 'results') foundPlaceIds.value = [];
});
const isRoundPlay = computed(() => game.state.phase === 'prompt' || game.state.phase === 'verdict');

const isShellReady = computed(() => isStartupRevealed.value && game.isReady);
const isHomeDrifting = computed(() => isMapDrawn.value && game.state.phase === 'home' && !setupDraft.value);
const { stopForVisit: stopDrift } = useHomeDrift(() => worldMap.value?.getMap(), isHomeDrifting);

const shownTier = computed(() => setupDraft.value?.tier ?? (game.state.phase === 'home' ? game.homeTier : game.state.setup.tier));
const poolPlaceIds = computed(() => setupDraft.value ? game.poolOf(setupDraft.value) : null);
const frameRegion = computed(() => setupDraft.value?.region ?? (game.state.phase === 'home' ? 'world' : game.state.setup.region));

const verdict = computed(() => game.state.phase === 'verdict' ? game.state.answer : null);

const resultPlaces = computed(() => {
  if (game.state.phase !== 'results') return null;
  const { answers, missedPlaceIds } = game.state;
  return [
    ...answers.map(({ placeId, outcome }) => ({ placeId, outcome })),
    ...missedPlaceIds.map(placeId => ({ placeId, outcome: 'missed' as const })),
  ];
});

const frameInset = computed(() => {
  if (setupDraft.value) return setupTrayHeight.value;
  return game.state.phase === 'results' ? resultsTrayHeight.value : 0;
});

const isMapInert = computed(() => !!setupDraft.value || isSettingsOpen.value || game.state.phase === 'results'
  || ((game.state.phase === 'prompt' || game.state.phase === 'verdict') && (game.state.isConfirmingEnd || game.state.isPaused)));

const handleTap = (placeId?: string) => {
  if (game.state.phase !== 'home') game.send({ type: 'tap', placeId });
};

const openSetup = (mode: Mode) => {
  setupDraft.value = game.setupFor(mode);
};

const closeSetup = async () => {
  setupDraft.value = null;
  await nextTick();
  homeTray.value?.focusModeTile();
};

const play = async (setup: RoundSetup | undefined) => {
  setupDraft.value = null;
  if (setup) game.play(setup);
  await nextTick();
  worldMap.value?.focus();
};

const next = () => {
  game.send({ type: 'next' });
  worldMap.value?.focus();
};

const playAgainFromResults = () => {
  if (game.state.phase === 'results') play(game.state.setup);
};

const changeSetup = () => {
  if (game.state.phase !== 'results') return;
  const { mode } = game.state.setup;
  game.send({ type: 'leave' });
  openSetup(mode);
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
        :is-at-min-zoom="worldMap?.isAtMinZoom ?? false"
        :is-at-max-zoom="worldMap?.isAtMaxZoom ?? false"
        @next="next"
        @zoom-in="worldMap?.zoomIn()"
        @zoom-out="worldMap?.zoomOut()"
      />
    </Transition>

    <Transition name="tray">
      <ResultsTray
        v-if="isShellReady && game.state.phase === 'results'"
        ref="resultsTray"
        :state="game.state"
        @play-again="playAgainFromResults"
        @change-setup="changeSetup"
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
      v-if="game.isReady"
      ref="worldMap"
      :verdict="verdict"
      :result-places="resultPlaces"
      :fade="answerFade"
      :tier="shownTier"
      :pool-place-ids="poolPlaceIds"
      :frame-region="frameRegion"
      :frame-inset="frameInset"
      :inert="isMapInert"
      :is-round-play="isRoundPlay"
      :found-place-ids="foundPlaceIds"
      @drawn="isMapDrawn = true"
      @tap="handleTap"
      @announce="announce"
    />

    <div
      class="visually-hidden"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ liveMessage }}
    </div>

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
