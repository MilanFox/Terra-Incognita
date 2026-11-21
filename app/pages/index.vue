<script setup lang="ts">
import type { JumpToOptions } from 'maplibre-gl';
import { dailySetupOf, isNoMapMode, isTypedMode } from '#shared/game/game';
import type { DailyVariant, Mode, RoundSetup } from '#shared/game/game';
import type StatsTray from '~/components/StatsTray.vue';
import type { StatsView } from '~/components/StatsTray.vue';
import type AboutTray from '~/components/AboutTray.vue';
import type { AboutSectionId } from '~/components/AboutTray.vue';
import { useRightAnswerFade } from '~/composables/useRightAnswerFade';
import { useStartupRevealed } from '~/composables/useStartupRevealed';
import { useGameStore } from '~/stores/game';
import { useHomeDrift } from '~/composables/useHomeDrift';
import { usePlayFeedback } from '~/composables/usePlayFeedback';
import { useMapFreeArea } from '~/composables/useMapFreeArea';
import { useLiveRegion, useRoundAnnouncements } from '~/composables/useLiveRegion';
import { useWayfinderAnnouncements } from '~/composables/useWayfinderAnnouncements';
import { useWayfinderLandFade } from '~/composables/useWayfinderLandFade';
import { useTwoStepSelect } from '~/composables/useTwoStepSelect';

type AboutOpener = { tray: 'home' } | { tray: 'setup', setup: RoundSetup, scrollTop: number } | { tray: 'stats', view: StatsView, camera: JumpToOptions };

const { locale } = useI18n();
const isStartupRevealed = useStartupRevealed();
const isMapDrawn = ref(false);
const game = useGameStore();
const worldMap = useTemplateRef('worldMap');
const homeTray = useTemplateRef('homeTray');
const setupTray = useTemplateRef('setupTray');
const dailySetupTray = useTemplateRef('dailySetupTray');
const resultsTray = useTemplateRef('resultsTray');
const typedAnswerTray = useTemplateRef('typedAnswerTray');
const wayfinderScreen = useTemplateRef<{ card?: HTMLElement | null, zoomTiles?: HTMLElement }>('wayfinderScreen');
const wayfinderAnswerTray = useTemplateRef('wayfinderAnswerTray');
const wayfinderResultsTray = useTemplateRef('wayfinderResultsTray');
const statsTray = useTemplateRef<InstanceType<typeof StatsTray>>('statsTray');
const aboutTray = useTemplateRef<InstanceType<typeof AboutTray>>('aboutTray');
const answerFade = useRightAnswerFade();
const setupDraft = ref<RoundSetup | null>(null);
const dailyDraft = ref<DailyVariant | null>(null);
const traySetup = computed(() => setupDraft.value ?? (dailyDraft.value ? dailySetupOf(dailyDraft.value) : null));
const { height: setupTrayHeight } = useElementSize(() => setupTray.value?.element, undefined, { box: 'border-box' });
const { height: dailySetupTrayHeight } = useElementSize(() => dailySetupTray.value?.element, undefined, { box: 'border-box' });
const { height: resultsTrayHeight } = useElementSize(() => resultsTray.value?.element, undefined, { box: 'border-box' });
const { height: typedAnswerTrayHeight } = useElementSize(() => typedAnswerTray.value?.element, undefined, { box: 'border-box' });
const { height: wayfinderResultsTrayHeight } = useElementSize(() => wayfinderResultsTray.value?.element, undefined, { box: 'border-box' });
const wayfinderFreeArea = useMapFreeArea({ map: () => worldMap.value?.$el, top: () => wayfinderScreen.value?.card, bottom: () => wayfinderAnswerTray.value?.element, right: () => wayfinderScreen.value?.zoomTiles });
const isSettingsOpen = ref(false);
const isStatsOpen = ref(false);
const isCameraHeld = ref(false);
const aboutOpeningSection = ref<AboutSectionId | null>(null);
const aboutOpener = shallowRef<AboutOpener>({ tray: 'home' });
const isAboutOpen = computed(() => aboutOpeningSection.value !== null);

usePlayFeedback(() => game.state);

const { message: liveMessage, announce } = useLiveRegion();
useRoundAnnouncements(() => game.state, announce);
useWayfinderAnnouncements(() => game.state, announce);
const { markedPlaceId, tapPlace, confirmMark } = useTwoStepSelect(() => game.state);

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
const routeMarks = computed(() => {
  if (game.state.phase !== 'wayfinder') return null;
  const { route, reveal, framedPlaceIds } = game.state;
  return { startId: route.start, targetId: route.target, namedPlaceIds: route.entries, framedPlaceIds, reveal: reveal && { routePlaceIds: reveal.yourRoute ?? [], shortestPlaceIds: reveal.shortestRoute ?? [] } };
});
const nameablePlaces = computed(() => (routeMarks.value
  ? Object.fromEntries([routeMarks.value.startId, routeMarks.value.targetId, ...routeMarks.value.namedPlaceIds].map(placeId => [placeId, game.nameOf(placeId, locale.value)]))
  : null));
const landShown = useWayfinderLandFade(() => game.state);
const highlightedPlaceId = computed(() => (game.state.phase === 'prompt' && isTypedRound.value && !isNoMapMode(game.state.setup.mode) ? game.state.placeId : null));

const isShellReady = computed(() => isStartupRevealed.value && game.isReady);
const isHomeDrifting = computed(() => isMapDrawn.value && game.state.phase === 'home' && !traySetup.value && !isStatsOpen.value && !isAboutOpen.value);
const { stopForVisit: stopDrift } = useHomeDrift(() => worldMap.value?.getMap(), isHomeDrifting);

const shownTier = computed(() => traySetup.value?.tier ?? (game.state.phase === 'home' ? (isAboutOpen.value ? 'dependencies' : game.homeTier) : game.state.setup.tier));
const poolPlaceIds = computed(() => {
  if (game.state.phase === 'missing') {
    const { gapPlaceIds, foundPlaceIds: foundGapIds, setup } = game.state;
    return game.poolOf({ ...setup, mode: 'find', variant: 'name' }).filter(id => !gapPlaceIds.includes(id) || foundGapIds.includes(id) || id === markedPlaceId.value);
  }
  if (traySetup.value) return game.poolOf(traySetup.value);
  return game.state.phase === 'fill' ? game.poolOf(game.state.setup) : null;
});
const gapPlaceIds = computed(() => (game.state.phase === 'missing' ? game.state.gapPlaceIds : []));
const frameRegion = computed(() => (isCameraHeld.value ? null : traySetup.value?.region ?? (game.state.phase === 'home' ? 'world' : game.state.setup.region)));

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
  if (isAboutOpen.value) return aboutTray.value?.trayHeight ?? 0;
  return game.state.phase === 'results' ? resultsTrayHeight.value : 0;
});

const isMapInert = computed(() => !!traySetup.value || isSettingsOpen.value || game.state.phase === 'results' || game.state.phase === 'wayfinderResults'
  || ((game.state.phase === 'prompt' || game.state.phase === 'verdict' || game.state.phase === 'missing' || game.state.phase === 'fill') && (game.state.isConfirmingEnd || game.state.isPaused))
  || (game.state.phase === 'wayfinder' && game.state.isConfirmingEnd));

const handleTap = async (placeId?: string) => {
  if (isStatsOpen.value) {
    if (!placeId || statsTray.value?.isSpecialPage) return;
    await statsTray.value?.openBubble(placeId);
    worldMap.value?.reveal(placeId);
  }
  else if (game.state.phase !== 'home') tapPlace(placeId);
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
  else if (isRoundPlay.value) worldMap.value?.focus();
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

const confirm = () => {
  confirmMark();
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
  isCameraHeld.value = false;
  await nextTick();
  homeTray.value?.focusStats();
};

const openAbout = (section: AboutSectionId = 'intro', opener: AboutOpener = { tray: 'home' }) => {
  aboutOpener.value = opener;
  aboutOpeningSection.value = section;
};

const swapSetupForAboutTiers = () => {
  if (!setupDraft.value) return;
  openAbout('tiers', { tray: 'setup', setup: setupDraft.value, scrollTop: setupTray.value?.element?.scrollTop ?? 0 });
  setupDraft.value = null;
};

const swapStatsForAbout = (section: AboutSectionId, view: StatsView) => {
  const map = worldMap.value?.getMap();
  if (!map) return;
  openAbout(section, { tray: 'stats', view, camera: { center: map.getCenter(), zoom: map.getZoom(), padding: map.getPadding() } });
  isStatsOpen.value = false;
  isCameraHeld.value = false;
};

const flyToRuling = (bounds: [[number, number], [number, number]]) => {
  isCameraHeld.value = true;
  worldMap.value?.flyToBounds(bounds);
};

const closeAbout = async () => {
  const opener = aboutOpener.value;
  aboutOpeningSection.value = null;
  if (opener.tray === 'setup') setupDraft.value = opener.setup;
  if (opener.tray === 'stats') isStatsOpen.value = true;
  isCameraHeld.value = opener.tray === 'stats';
  await nextTick();
  if (opener.tray === 'setup') {
    if (setupTray.value?.element) setupTray.value.element.scrollTop = opener.scrollTop;
    setupTray.value?.focusAboutTiers();
  }
  else if (opener.tray === 'stats') {
    aboutOpener.value = { tray: 'home' };
    worldMap.value?.getMap()?.jumpTo(opener.camera);
    statsTray.value?.focusWhy();
  }
  else homeTray.value?.focusAbout();
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
        v-if="isShellReady && game.state.phase === 'home' && !setupDraft && !dailyDraft && !isSettingsOpen && !isStatsOpen && !isAboutOpen"
        ref="homeTray"
        :last-setup="game.lastSetup"
        :todays-daily="game.todaysDaily"
        :streak="game.streak"
        @play-again="play(game.lastSetup)"
        @open-setup="openSetup"
        @open-daily="openDaily"
        @settings="isSettingsOpen = true"
        @stats="isStatsOpen = true"
        @about="openAbout()"
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
        @about-tiers="swapSetupForAboutTiers"
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
        :is-marked="!!markedPlaceId"
        :is-at-min-zoom="worldMap?.isAtMinZoom ?? false"
        :is-at-max-zoom="worldMap?.isAtMaxZoom ?? false"
        @next="next"
        @confirm="confirm"
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
        :is-marked="!!markedPlaceId"
        :is-at-min-zoom="worldMap?.isAtMinZoom ?? false"
        :is-at-max-zoom="worldMap?.isAtMaxZoom ?? false"
        @confirm="confirm"
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
      <TypedAnswerTray
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
      :role="isStatsOpen || isAboutOpen ? 'dialog' : undefined"
      :aria-modal="isStatsOpen || isAboutOpen || undefined"
      :aria-labelledby="isStatsOpen ? statsTray?.titleId : isAboutOpen ? aboutTray?.titleId : undefined"
    >
      <Transition name="tray">
        <StatsTray
          v-if="isShellReady && game.state.phase === 'home' && isStatsOpen"
          ref="statsTray"
          :restored-view="aboutOpener.tray === 'stats' ? aboutOpener.view : undefined"
          :map-canvas="worldMap?.getMap()?.getCanvas()"
          :is-at-min-zoom="worldMap?.isAtMinZoom ?? false"
          :is-at-max-zoom="worldMap?.isAtMaxZoom ?? false"
          @zoom-in="worldMap?.zoomIn()"
          @zoom-out="worldMap?.zoomOut()"
          @fly-to-region="worldMap?.flyToRegion($event)"
          @announce="announce"
          @why="swapStatsForAbout"
          @close="closeStats"
        />
      </Transition>

      <Transition name="tray">
        <AboutTray
          v-if="isShellReady && game.state.phase === 'home' && aboutOpeningSection"
          ref="aboutTray"
          :opening-section="aboutOpeningSection"
          :opening-place-id="aboutOpener.tray === 'stats' ? aboutOpener.view.bubblePlaceId : undefined"
          :back-label="aboutOpener.tray === 'home' ? undefined : $t(`about.backTo.${aboutOpener.tray}`)"
          :map-canvas="worldMap?.getMap()?.getCanvas()"
          :is-at-min-zoom="worldMap?.isAtMinZoom ?? false"
          :is-at-max-zoom="worldMap?.isAtMaxZoom ?? false"
          @zoom-in="worldMap?.zoomIn()"
          @zoom-out="worldMap?.zoomOut()"
          @fly-to="flyToRuling"
          @close="closeAbout"
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
        :gap-place-ids="gapPlaceIds"
        :frame-region="frameRegion"
        :frame-inset="frameInset"
        :inert="isMapInert"
        :is-round-play="isRoundPlay"
        :is-focusable="isRoundPlay || isWayfinderRound || isFillRound || isStatsOpen || isAboutOpen"
        :is-stats-map="isStatsOpen || isAboutOpen"
        :bottom-cover="isStatsOpen ? statsTray?.visibleTrayHeight ?? 0 : 0"
        :selected-place-id="isStatsOpen ? statsTray?.bubblePlaceId : markedPlaceId"
        :found-place-ids="foundPlaceIds"
        :highlighted-place-id="highlightedPlaceId"
        :keyboard-inset="isTypedRound || isFillRound ? typedAnswerTrayHeight : 0"
        :is-names-only="isAboutOpen || (isStatsOpen && statsTray?.isSpecialPage)"
        :place-ratings="isStatsOpen ? statsTray?.placeRatings ?? null : null"
        :route="routeMarks"
        :land-shown="landShown"
        :nameable-places="nameablePlaces"
        :top-inset="isStatsOpen ? statsTray?.bubbleBottom ?? 0 : 0"
        :free-area="isWayfinderRound ? wayfinderFreeArea : null"
        @drawn="isMapDrawn = true"
        @tap="handleTap"
        @cursor="announce(isAboutOpen ? game.nameOf($event, locale) : statsTray?.placeLabel($event) ?? '')"
        @announce="announce"
        @next="next"
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
