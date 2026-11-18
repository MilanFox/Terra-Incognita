<script setup lang="ts">
import { dailySetupOf, isNoMapMode, isTypedMode } from '#shared/game/game';
import type { DailyVariant, Mode, RoundSetup } from '#shared/game/game';
import type StatsTray from '~/components/StatsTray.vue';
import { useRightAnswerFade } from '~/composables/useRightAnswerFade';
import { useStartupRevealed } from '~/composables/useStartupRevealed';
import { useGameStore } from '~/stores/game';
import { useHomeDrift } from '~/composables/useHomeDrift';
import { usePlayFeedback } from '~/composables/usePlayFeedback';
import { useLiveRegion, useRoundAnnouncements } from '~/composables/useLiveRegion';
import { useWayfinderAnnouncements } from '~/composables/useWayfinderAnnouncements';

const isStartupRevealed = useStartupRevealed();
const isMapDrawn = ref(false);
const game = useGameStore();
const worldMap = useTemplateRef('worldMap');
const homeTray = useTemplateRef('homeTray');
const setupTray = useTemplateRef('setupTray');
const dailySetupTray = useTemplateRef('dailySetupTray');
const resultsTray = useTemplateRef('resultsTray');
const typedAnswerTray = useTemplateRef('typedAnswerTray');
const wayfinderScreen = useTemplateRef<{ cardBottom: number }>('wayfinderScreen');
const wayfinderAnswerTray = useTemplateRef('wayfinderAnswerTray');
const wayfinderResultsTray = useTemplateRef('wayfinderResultsTray');
const statsTray = useTemplateRef<InstanceType<typeof StatsTray>>('statsTray');
const answerFade = useRightAnswerFade();
const setupDraft = ref<RoundSetup | null>(null);
const dailyDraft = ref<DailyVariant | null>(null);
const traySetup = computed(() => setupDraft.value ?? (dailyDraft.value ? dailySetupOf(dailyDraft.value) : null));
const { height: setupTrayHeight } = useElementSize(() => setupTray.value?.element, undefined, { box: 'border-box' });
const { height: dailySetupTrayHeight } = useElementSize(() => dailySetupTray.value?.element, undefined, { box: 'border-box' });
const { height: resultsTrayHeight } = useElementSize(() => resultsTray.value?.element, undefined, { box: 'border-box' });
const { height: typedAnswerTrayHeight } = useElementSize(() => typedAnswerTray.value?.element, undefined, { box: 'border-box' });
const { height: wayfinderAnswerTrayHeight } = useElementSize(() => wayfinderAnswerTray.value?.element, undefined, { box: 'border-box' });
const { height: wayfinderResultsTrayHeight } = useElementSize(() => wayfinderResultsTray.value?.element, undefined, { box: 'border-box' });
const isSettingsOpen = ref(false);
const isStatsOpen = ref(false);

usePlayFeedback(() => game.state);

const { message: liveMessage, announce } = useLiveRegion();
useRoundAnnouncements(() => game.state, announce);
useWayfinderAnnouncements(() => game.state, announce);

const foundPlaceIds = ref<string[]>([]);
watch(() => game.state, (state) => {
  if (state.phase === 'verdict' && state.answer.outcome === 'right') foundPlaceIds.value.push(state.answer.placeId);
  else if (state.phase === 'missing') foundPlaceIds.value = state.foundPlaceIds;
  else if (state.phase === 'home' || state.phase === 'results') foundPlaceIds.value = [];
});
const isTypedRound = computed(() => (game.state.phase === 'prompt' || game.state.phase === 'verdict') && isTypedMode(game.state.setup.mode));
const isFillRound = computed(() => game.state.phase === 'fill');
const isRoundPlay = computed(() => ((game.state.phase === 'prompt' || game.state.phase === 'verdict') && !isTypedRound.value) || game.state.phase === 'missing');
const isWayfinderRound = computed(() => game.state.phase === 'wayfinder');
const routeMarks = computed(() => (game.state.phase === 'wayfinder' ? { startId: game.state.route.start, targetId: game.state.route.target, namedPlaceIds: game.state.route.entries } : null));
const highlightedPlaceId = computed(() => (game.state.phase === 'prompt' && isTypedRound.value && !isNoMapMode(game.state.setup.mode) ? game.state.placeId : null));

const isShellReady = computed(() => isStartupRevealed.value && game.isReady);
const isHomeDrifting = computed(() => isMapDrawn.value && game.state.phase === 'home' && !traySetup.value && !isStatsOpen.value);
const { stopForVisit: stopDrift } = useHomeDrift(() => worldMap.value?.getMap(), isHomeDrifting);

const shownTier = computed(() => traySetup.value?.tier ?? (game.state.phase === 'home' ? game.homeTier : game.state.setup.tier));
const poolPlaceIds = computed(() => {
  if (game.state.phase === 'missing') {
    const { gapPlaceIds, foundPlaceIds: foundGapIds, setup } = game.state;
    return game.poolOf({ ...setup, mode: 'find', variant: 'name' }).filter(id => !gapPlaceIds.includes(id) || foundGapIds.includes(id));
  }
  if (traySetup.value) return game.poolOf(traySetup.value);
  return game.state.phase === 'fill' ? game.poolOf(game.state.setup) : null;
});
const frameRegion = computed(() => traySetup.value?.region ?? (game.state.phase === 'home' ? 'world' : game.state.setup.region));

const verdict = computed(() => game.state.phase === 'verdict' ? game.state.answer : null);

watch(verdict, (answer) => {
  if (answer?.outcome === 'right' && game.state.phase === 'verdict' && isNoMapMode(game.state.setup.mode)) worldMap.value?.flyTo(answer.placeId);
});

const resultPlaces = computed(() => {
  if (game.state.phase === 'missing') return game.state.foundPlaceIds.map(placeId => ({ placeId, outcome: 'right' as const }));
  if (game.state.phase === 'fill') return game.state.filledLandPlaceIds.map(placeId => ({ placeId, outcome: 'right' as const }));
  if (game.state.phase !== 'results') return null;
  const { answers, missedPlaceIds } = game.state;
  return [
    ...answers.map(({ placeId, outcome }) => ({ placeId, outcome })),
    ...missedPlaceIds.map(placeId => ({ placeId, outcome: 'missed' as const })),
  ];
});

const frameInset = computed(() => {
  if (setupDraft.value) return setupTrayHeight.value;
  if (dailyDraft.value) return dailySetupTrayHeight.value;
  if (game.state.phase === 'wayfinderResults') return wayfinderResultsTrayHeight.value;
  if (isStatsOpen.value) return statsTray.value?.peekHeight ?? 0;
  return game.state.phase === 'results' ? resultsTrayHeight.value : 0;
});

const isMapInert = computed(() => !!traySetup.value || isSettingsOpen.value || game.state.phase === 'results' || game.state.phase === 'wayfinderResults'
  || ((game.state.phase === 'prompt' || game.state.phase === 'verdict' || game.state.phase === 'missing' || game.state.phase === 'fill') && (game.state.isConfirmingEnd || game.state.isPaused))
  || (game.state.phase === 'wayfinder' && game.state.isConfirmingEnd));

const handleTap = async (placeId?: string) => {
  if (isStatsOpen.value) {
    if (!placeId) return;
    await statsTray.value?.openBubble(placeId);
    worldMap.value?.reveal(placeId);
  }
  else if (game.state.phase !== 'home') game.send({ type: 'tap', placeId });
};

const openSetup = (mode: Mode) => {
  setupDraft.value = game.setupFor(mode);
};

const closeSetup = async () => {
  const mode = setupDraft.value?.mode ?? 'find';
  setupDraft.value = null;
  await nextTick();
  homeTray.value?.focusModeTile(mode);
};

const openDaily = () => {
  if (game.todaysDaily) game.viewDaily();
  else dailyDraft.value = game.dailyVariant();
};

const closeDaily = async () => {
  dailyDraft.value = null;
  await nextTick();
  homeTray.value?.focusDailyTile();
};

const playDaily = async (variant: DailyVariant) => {
  dailyDraft.value = null;
  game.playDaily(variant);
  await nextTick();
  worldMap.value?.focus();
};

const focusAnswering = () => {
  if (isWayfinderRound.value) wayfinderAnswerTray.value?.focus();
  else if (isTypedRound.value || isFillRound.value) typedAnswerTray.value?.focus();
  else worldMap.value?.focus();
};

const play = async (setup: RoundSetup | undefined) => {
  setupDraft.value = null;
  if (setup) game.play(setup);
  await nextTick();
  focusAnswering();
};

const next = () => {
  game.send({ type: 'next' });
  focusAnswering();
};

const dontKnow = () => {
  game.send({ type: 'dontKnow' });
  focusAnswering();
};

const playAgainFromResults = () => {
  if (game.state.phase === 'results' || game.state.phase === 'wayfinderResults') play(game.state.setup);
};

const changeSetup = () => {
  if (game.state.phase !== 'results' && game.state.phase !== 'wayfinderResults') return;
  const { mode } = game.state.setup;
  game.send({ type: 'leave' });
  openSetup(mode);
};

const closeSettings = async () => {
  isSettingsOpen.value = false;
  await nextTick();
  homeTray.value?.focusSettings();
};

const closeStats = async () => {
  isStatsOpen.value = false;
  await nextTick();
  homeTray.value?.focusStats();
};

const leave = async () => {
  const wasDaily = game.state.phase === 'results' && game.state.dailyDate !== null;
  game.send({ type: 'leave' });
  await nextTick();
  if (wasDaily) homeTray.value?.focusDailyTile();
  else homeTray.value?.focus();
};

onMounted(game.load);
</script>

<template>
  <main class="home">
    <Transition name="tray">
      <HomeTray
        v-if="isShellReady && game.state.phase === 'home' && !setupDraft && !dailyDraft && !isSettingsOpen && !isStatsOpen"
        ref="homeTray"
        :last-setup="game.lastSetup"
        :todays-daily="game.todaysDaily"
        :streak="game.streak"
        @play-again="play(game.lastSetup)"
        @open-setup="openSetup"
        @open-daily="openDaily"
        @settings="isSettingsOpen = true"
        @stats="isStatsOpen = true"
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

    <Transition name="tray">
      <DailySetupTray
        v-if="isShellReady && game.state.phase === 'home' && dailyDraft"
        ref="dailySetupTray"
        v-model:variant="dailyDraft"
        @play="playDaily(dailyDraft)"
        @close="closeDaily"
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
        @dont-know="dontKnow"
        @zoom-in="worldMap?.zoomIn()"
        @zoom-out="worldMap?.zoomOut()"
      />
    </Transition>

    <Transition name="drop">
      <FillScreen
        v-if="isShellReady && game.state.phase === 'fill'"
        :state="game.state"
        :is-at-min-zoom="worldMap?.isAtMinZoom ?? false"
        :is-at-max-zoom="worldMap?.isAtMaxZoom ?? false"
        @zoom-in="worldMap?.zoomIn()"
        @zoom-out="worldMap?.zoomOut()"
      />

      <MissingRound
        v-else-if="isShellReady && game.state.phase === 'missing'"
        :state="game.state"
        :is-at-min-zoom="worldMap?.isAtMinZoom ?? false"
        :is-at-max-zoom="worldMap?.isAtMaxZoom ?? false"
        @zoom-in="worldMap?.zoomIn()"
        @zoom-out="worldMap?.zoomOut()"
      />
    </Transition>

    <Transition name="tray">
      <TypedAnswerTray
        v-if="isShellReady && game.state.phase === 'fill'"
        ref="typedAnswerTray"
        :state="game.state"
      />

      <ChoiceTray
        v-else-if="isShellReady && (game.state.phase === 'prompt' || game.state.phase === 'verdict') && isTypedRound && game.state.setup.easy"
        ref="typedAnswerTray"
        :state="game.state"
      />

      <TypedAnswerTray
        v-else-if="isShellReady && (game.state.phase === 'prompt' || game.state.phase === 'verdict') && isTypedRound"
        ref="typedAnswerTray"
        :state="game.state"
        @next="next"
      />
    </Transition>

    <Transition name="drop">
      <WayfinderRoundScreen
        v-if="isShellReady && game.state.phase === 'wayfinder'"
        ref="wayfinderScreen"
        :state="game.state"
        :is-at-min-zoom="worldMap?.isAtMinZoom ?? false"
        :is-at-max-zoom="worldMap?.isAtMaxZoom ?? false"
        @next="next"
        @zoom-in="worldMap?.zoomIn()"
        @zoom-out="worldMap?.zoomOut()"
      />
    </Transition>

    <Transition name="tray">
      <WayfinderAnswerTray
        v-if="isShellReady && game.state.phase === 'wayfinder'"
        ref="wayfinderAnswerTray"
        :state="game.state"
        @next="next"
      />
    </Transition>

    <Transition name="tray">
      <WayfinderResultsTray
        v-if="isShellReady && game.state.phase === 'wayfinderResults'"
        ref="wayfinderResultsTray"
        :state="game.state"
        @play-again="playAgainFromResults"
        @change-setup="changeSetup"
        @leave="leave"
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

    <div
      class="home__map-scope"
      :role="isStatsOpen ? 'dialog' : undefined"
      :aria-modal="isStatsOpen || undefined"
      :aria-labelledby="isStatsOpen ? statsTray?.titleId : undefined"
    >
      <Transition name="tray">
        <StatsTray
          v-if="isShellReady && game.state.phase === 'home' && isStatsOpen"
          ref="statsTray"
          :map-canvas="worldMap?.getMap()?.getCanvas()"
          :is-at-min-zoom="worldMap?.isAtMinZoom ?? false"
          :is-at-max-zoom="worldMap?.isAtMaxZoom ?? false"
          @zoom-in="worldMap?.zoomIn()"
          @zoom-out="worldMap?.zoomOut()"
          @fly-to-region="worldMap?.flyToRegion($event)"
          @announce="announce"
          @close="closeStats"
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
        :is-stats-map="isStatsOpen"
        :bottom-cover="isStatsOpen ? statsTray?.visibleTrayHeight ?? 0 : 0"
        :selected-place-id="isStatsOpen ? statsTray?.bubblePlaceId : null"
        :found-place-ids="foundPlaceIds"
        :highlighted-place-id="highlightedPlaceId"
        :keyboard-inset="isTypedRound || isFillRound ? typedAnswerTrayHeight : isWayfinderRound ? wayfinderAnswerTrayHeight : 0"
        :place-ratings="isStatsOpen ? statsTray?.placeRatings ?? null : null"
        :route="routeMarks"
        :land-shown="isWayfinderRound ? 0 : 1"
        :top-inset="isStatsOpen ? statsTray?.bubbleBottom ?? 0 : wayfinderScreen?.cardBottom ?? 0"
        @drawn="isMapDrawn = true"
        @tap="handleTap"
        @cursor="announce(statsTray?.placeLabel($event) ?? '')"
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

  &__map-scope {
    position: absolute;
    inset: 0;
  }
}
</style>
