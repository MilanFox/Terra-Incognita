<script setup lang="ts">
import type { GameState, Region } from '#shared/game/game';
import { placeStoryOf, resultsReportOf } from '#shared/game/results-report';
import type { DeckEntry, Mistake, RegionTally } from '#shared/game/results-report';
import { useBackStep } from '~/composables/useBackSteps';
import { useDurationText } from '~/composables/useDurationText';
import { useTrayFocusCycle } from '~/composables/useTrayFocusCycle';
import { useTraySwipe } from '~/composables/useTraySwipe';
import type { TraySettle } from '~/composables/useTraySwipe';
import { useGameStore } from '~/stores/game';

type Snap = 'peek' | 'half' | 'full';

const props = defineProps<{ state: Extract<GameState, { phase: 'results' }>, mapCanvas?: HTMLElement | null, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ playAgain: [], changeSetup: [], leave: [], zoomIn: [], zoomOut: [], framePlaces: [placeIds: string[], topCover: number], frameRegion: [region: Region], announce: [text: string] }>();

const halfShare = 0.55;
const minSnapGapPx = 80;
const zoomTilesGapPx = 12;
const zoomTilesRoomPx = 120;
const bubbleGapPx = 10;

const { t, locale } = useI18n();
const game = useGameStore();
const durationTextOf = useDurationText();

const titleId = useId();
const moreId = useId();
const regionsId = useId();
const mistakesId = useId();
const unreachedId = useId();
const overlay = useTemplateRef<HTMLElement>('overlay');
const tray = useTemplateRef<HTMLElement>('tray');
const handle = useTemplateRef<HTMLButtonElement>('handle');
const title = useTemplateRef<HTMLHeadingElement>('title');
const more = useTemplateRef<HTMLElement>('more');
const placeBubble = useTemplateRef<{ bottom: number, layoutBottom: () => number }>('placeBubble');
const zoomTiles = useTemplateRef<ComponentPublicInstance>('zoomTiles');
const { height: overlayHeight } = useElementSize(overlay);

const report = computed(() => resultsReportOf(props.state, { regionOf: game.regionOf, mixUpCount: game.mixUpCount }));
const isFill = computed(() => props.state.setup.mode === 'fill');
const elapsedTime = computed(() => durationTextOf(Math.round(props.state.elapsedMs / 1000)));

const nameOf = (placeId: string) => game.nameOf(placeId, locale.value);
const regionNameOf = (region: Region) => t(`setup.regions.${region}`);

const setupLineWith = (time: string) => t('results.sheet.setupLine', {
  mode: t(`modes.${props.state.setup.mode}.name`),
  region: t(`setup.regions.${props.state.setup.region}`),
  tier: t(`setup.tiers.${props.state.setup.tier}`),
  time,
});

const scoreText = computed(() => (isFill.value
  ? t('fill.progress', { count: props.state.score, total: props.state.deckSize })
  : t('results.scoreText', { score: props.state.score, total: props.state.deckSize })));

const newBestLine = computed(() => t('record.newBest', {
  region: t(`setup.regions.${props.state.setup.region}`),
  tier: t(`setup.tiers.${props.state.setup.tier}`),
  deckSize: t(`setup.deckSizes.${props.state.setup.deckSize}`),
}));

const statTiles = computed(() => {
  const { rightCount, wrongCount, missedCount } = report.value;
  return isFill.value
    ? [
        { label: t('results.sheet.filled'), value: rightCount, text: t('results.sheet.filledText', { count: rightCount }) },
        { label: t('results.sheet.unfilled'), value: missedCount, text: t('results.sheet.unfilledText', { count: missedCount }) },
      ]
    : [
        { label: t('results.sheet.rightCount'), value: rightCount, text: t('results.sheet.rightCountText', { count: rightCount }) },
        { label: t('results.wrongCount'), value: wrongCount, text: t('results.wrongCountText', { count: wrongCount }) },
        { label: t('results.missedCount'), value: missedCount, text: t('results.missedCountText', { count: missedCount }) },
      ];
});

const outcomeWordOf = (entry: DeckEntry | null) => {
  if (!entry) return t('results.sheet.outcomes.notInRound');
  if (isFill.value) return t(`results.sheet.outcomes.${entry.outcome === 'right' ? 'filled' : 'unfilled'}`);
  return t(`results.sheet.outcomes.${entry.outcome}`);
};

const entryLabelOf = (entry: DeckEntry) => t('results.sheet.entry', { number: entry.promptNumber, place: nameOf(entry.placeId), outcome: outcomeWordOf(entry) });

const orderLabel = computed(() => t('results.sheet.orderLabel', { right: report.value.rightCount, wrong: report.value.wrongCount, missed: report.value.missedCount }));

const regionDetailOf = ({ wrong, missed, unreached }: RegionTally) => {
  if (isFill.value) return unreached ? t('results.sheet.regionUnfilled', { count: unreached }) : t('results.sheet.regionAllFilled');
  const parts = [
    ...wrong ? [t('results.wrongCountText', { count: wrong })] : [],
    ...missed + unreached ? [t('results.missedCountText', { count: missed + unreached })] : [],
  ];
  return parts.join(' · ') || t('results.sheet.regionAllRight');
};

const regionScoreTextOf = ({ right, total }: RegionTally) => (isFill.value
  ? t('results.sheet.regionFilledText', { count: right, total })
  : t('results.scoreText', { score: right, total }));

const mistakeRows = computed(() => report.value.mistakes.map((mistake) => {
  const region = game.regionOf(mistake.askedPlaceId);
  return {
    mistake,
    asked: nameOf(mistake.askedPlaceId),
    answered: nameOf(mistake.answeredPlaceId),
    tag: t(`results.sheet.tags.${mistake.tag}`, { count: mistake.mixUpCount }),
    tagSpoken: t(`results.sheet.tagsSpoken.${mistake.tag}`, { count: mistake.mixUpCount }),
    prompt: t('results.sheet.mistakePrompt', { number: mistake.promptNumber, region: region ? regionNameOf(region) : '' }),
  };
}));

const regionsWithGaps = computed(() => report.value.regions.filter(({ unreached }) => unreached > 0));

const snap = ref<Snap>('peek');
const isFull = computed({
  get: () => snap.value === 'full',
  set: (nowFull) => {
    snap.value = nowFull ? 'full' : 'peek';
  },
});
const isPositioned = ref(false);
const collapsedShift = ref(0);
const peekHeight = ref(0);
const trayHeight = ref(0);
const halfShift = computed(() => Math.max(0, trayHeight.value - Math.round(overlayHeight.value * halfShare)));
const snapShifts = computed<Record<Snap, number>>(() => ({ peek: collapsedShift.value, half: halfShift.value, full: 0 }));
const snaps = computed<Snap[]>(() => (halfShift.value >= minSnapGapPx && collapsedShift.value - halfShift.value >= minSnapGapPx ? ['peek', 'half', 'full'] : ['peek', 'full']));

const measure = () => {
  if (!tray.value || !more.value) return;
  peekHeight.value = Math.round(more.value.getBoundingClientRect().top - tray.value.getBoundingClientRect().top + tray.value.scrollTop);
  trayHeight.value = tray.value.offsetHeight;
  collapsedShift.value = Math.max(0, trayHeight.value - peekHeight.value);
};

const nearestSnapTo = (shift: number, candidates: Snap[]) => candidates.reduce((nearest, candidate) => (Math.abs(snapShifts.value[candidate] - shift) < Math.abs(snapShifts.value[nearest] - shift) ? candidate : nearest));

const settle = ({ shift, startShift, direction }: TraySettle) => {
  const onTheWay = snaps.value.filter(candidate => (direction === 'up' ? snapShifts.value[candidate] < startShift : direction === 'down' ? snapShifts.value[candidate] > startShift : true));
  snap.value = nearestSnapTo(shift, onTheWay.length > 0 ? onTheWay : snaps.value);
};

const { dragShift, onPointerDown, onTouchStart, onTouchMove, onTouchEnd, onClickCapture } = useTraySwipe({
  tray,
  isOpen: isFull,
  collapsedShift,
  restingShift: () => snapShifts.value[snap.value],
  onSettle: settle,
});

const stepSnap = () => {
  snap.value = snaps.value[(snaps.value.indexOf(snap.value) + 1) % snaps.value.length]!;
};

const handleLabel = computed(() => (snap.value === 'full' ? t('stats.showLess') : snap.value === 'half' ? t('results.sheet.showAll') : t('stats.showMore')));

const bubblePlaceId = ref<string | null>(null);
const bubbleStory = computed(() => (bubblePlaceId.value ? placeStoryOf(report.value, bubblePlaceId.value, game.regionOf) : null));
const hintedPlaceId = computed(() => bubbleStory.value?.mistake?.answeredPlaceId ?? null);

const mixUpLineOf = ({ mixUpCount, answeredPlaceId }: Mistake) => (mixUpCount === 1
  ? t('results.sheet.bubble.mixUpNew', { answered: nameOf(answeredPlaceId) })
  : t('results.sheet.bubble.mixUpCount', { count: mixUpCount, answered: nameOf(answeredPlaceId) }));

const outcomeLineOf = (entry: DeckEntry | null, mistake: Mistake | null) => {
  if (!entry) return t('results.sheet.bubble.notInRound');
  if (isFill.value) return t(`results.sheet.bubble.${entry.outcome === 'right' ? 'filled' : 'unfilled'}`, { number: entry.promptNumber });
  if (mistake) return t('results.sheet.bubble.wrongAnswered', { number: entry.promptNumber, answered: nameOf(mistake.answeredPlaceId) });
  return t(`results.sheet.bubble.${entry.outcome}`, { number: entry.promptNumber });
};

const bubbleLines = computed(() => {
  if (!bubbleStory.value) return [];
  const { entry, mistake, answeredInsteadOf, region } = bubbleStory.value;
  return [
    outcomeLineOf(entry, mistake),
    ...mistake ? [mixUpLineOf(mistake)] : [],
    ...answeredInsteadOf.map(({ askedPlaceId, promptNumber }) => t('results.sheet.bubble.answeredInstead', { asked: nameOf(askedPlaceId), number: promptNumber })),
    ...region ? [t(isFill.value ? 'results.sheet.bubble.regionFilled' : 'results.sheet.bubble.regionRight', { region: regionNameOf(region.region), right: region.right, total: region.total })] : [],
  ];
});

const bubbleTag = computed(() => {
  const mistake = bubbleStory.value?.mistake;
  return mistake?.tag === 'classic' ? t('results.sheet.tags.classic', { count: mistake.mixUpCount }) : undefined;
});

const trayShift = computed(() => dragShift.value ?? snapShifts.value[snap.value]);
const bubbleBottom = computed(() => (bubblePlaceId.value ? placeBubble.value?.bottom ?? 0 : 0));
const fullTrayLimit = computed(() => (isFull.value && bubbleBottom.value ? `calc(100% - ${bubbleBottom.value + bubbleGapPx}px)` : undefined));
const visibleTrayHeight = computed(() => trayHeight.value - trayShift.value);
const hasRoomForZoomTiles = computed(() => overlayHeight.value - visibleTrayHeight.value >= zoomTilesRoomPx);

watch(snaps, (available) => {
  if (!available.includes(snap.value)) snap.value = 'full';
});

watch(snap, (shown) => {
  if (shown !== 'full' && tray.value) tray.value.scrollTop = 0;
});

// Focus on a row below the fold scrolls the sheet even while it cannot be scrolled by hand; half then opens fully around the row.
const keepScrollWithinFull = () => {
  if (!tray.value || tray.value.scrollTop === 0 || snap.value === 'full') return;
  if (snap.value === 'half') snap.value = 'full';
  else tray.value.scrollTop = 0;
};

const placeLabel = (placeId: string) => t('live.statsPlace', { name: nameOf(placeId), rating: outcomeWordOf(placeStoryOf(report.value, placeId, game.regionOf).entry) });

const openBubble = async (placeId: string) => {
  bubblePlaceId.value = placeId;
  await nextTick();
  emit('announce', [nameOf(placeId), ...bubbleLines.value].join('. '));
};

const closeBubble = () => {
  if (overlay.value?.querySelector('.results-bubble')?.contains(document.activeElement)) props.mapCanvas?.focus();
  bubblePlaceId.value = null;
};

const dropToPeek = () => {
  snap.value = 'peek';
  handle.value?.focus({ preventScroll: true });
};

const showPlaces = async (placeIds: string[]) => {
  dropToPeek();
  await openBubble(placeIds[0]!);
  emit('framePlaces', placeIds, placeBubble.value?.layoutBottom() ?? 0);
};

const showRegion = (region: Region) => {
  closeBubble();
  dropToPeek();
  emit('frameRegion', region);
};

useBackStep(closeBubble, () => !!bubblePlaceId.value);

const trapFocus = useTrayFocusCycle(overlay, () => props.mapCanvas);

useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (bubblePlaceId.value) closeBubble();
    else emit('leave');
  }
  else if (event.key === 'Tab') trapFocus(event);
});

onMounted(() => {
  title.value?.focus({ preventScroll: true });
  measure();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    isPositioned.value = true;
  }));
});
useResizeObserver(tray, measure);

defineExpose({ titleId, peekHeight, visibleTrayHeight, bubblePlaceId, bubbleBottom, hintedPlaceId, openBubble, placeLabel, zoomTiles: computed(() => zoomTiles.value?.$el as HTMLElement | undefined) });
</script>

<template>
  <div
    ref="overlay"
    class="results-overlay"
  >
    <ResultsPlaceBubble
      v-if="bubblePlaceId && bubbleStory"
      ref="placeBubble"
      :place-name="nameOf(bubblePlaceId)"
      :outcome="bubbleStory.entry?.outcome ?? null"
      :tag="bubbleTag"
      :lines="bubbleLines"
      @close="closeBubble"
    />

    <div
      ref="tray"
      class="tray results-sheet"
      :class="{ 'results-sheet--full': isFull, 'results-sheet--dragging': dragShift !== null, 'results-sheet--unpositioned': !isPositioned }"
      :style="{ translate: `0 ${trayShift}px`, maxHeight: fullTrayLimit }"
      @pointerdown="onPointerDown"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
      @click.capture="onClickCapture"
      @scroll="keepScrollWithinFull"
    >
      <button
        ref="handle"
        type="button"
        class="results-sheet__handle"
        :aria-expanded="snap !== 'peek'"
        :aria-controls="moreId"
        @click="stepSnap"
      >
        <span
          class="results-sheet__grabber"
          aria-hidden="true"
        />

        <span class="kicker results-sheet__handle-label">
          {{ handleLabel }}

          <svg
            class="results-sheet__chevron"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
          >
            <path
              d="M6 15l6-6 6 6"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="square"
            />
          </svg>
        </span>
      </button>

      <div class="results-sheet__peek">
        <div class="results-sheet__headline">
          <h2
            :id="titleId"
            ref="title"
            class="results-sheet__title"
            tabindex="-1"
          >
            {{ state.isComplete ? $t('results.title') : $t('results.titleEnded') }}
          </h2>

          <p class="results-sheet__score">
            <span aria-hidden="true">{{ state.score }}<small>/{{ state.deckSize }}</small></span>

            <span class="visually-hidden">{{ scoreText }}</span>
          </p>
        </div>

        <p
          v-if="state.isNewBest"
          class="results-sheet__new-best"
        >
          {{ newBestLine }}
        </p>

        <p class="results-sheet__setup">
          <span aria-hidden="true">{{ setupLineWith(elapsedTime.shown) }}</span>

          <span class="visually-hidden">{{ setupLineWith(elapsedTime.spoken) }}</span>
        </p>

        <div class="results-sheet__actions">
          <button
            type="button"
            class="tile results-sheet__play-again"
            @click="emit('playAgain')"
          >
            {{ $t('results.playAgain') }}
          </button>

          <button
            type="button"
            class="tile results-sheet__secondary"
            @click="emit('changeSetup')"
          >
            {{ $t('results.changeSetup') }}
          </button>

          <button
            type="button"
            class="tile results-sheet__secondary"
            @click="emit('leave')"
          >
            {{ $t('results.home') }}
          </button>
        </div>
      </div>

      <div
        :id="moreId"
        ref="more"
        class="results-sheet__more"
        :inert="snap === 'peek'"
      >
        <div class="results-sheet__stats">
          <div
            v-for="stat in statTiles"
            :key="stat.label"
            class="tile results-sheet__stat"
          >
            <span
              class="results-sheet__stat-value"
              aria-hidden="true"
            >{{ stat.value }}</span>

            <span class="visually-hidden">{{ stat.text }}</span>

            <span
              class="kicker results-sheet__stat-label"
              aria-hidden="true"
            >{{ stat.label }}</span>
          </div>
        </div>

        <div
          v-if="!isFill"
          class="results-sheet__section"
        >
          <h3 class="kicker results-sheet__kicker">
            {{ $t('results.sheet.order') }}
          </h3>

          <ResultsBarcode
            :deck="report.deck"
            :selected-place-id="bubblePlaceId"
            :label="orderLabel"
            :entry-label-of="entryLabelOf"
            @pick="showPlaces([$event])"
          />
        </div>

        <div class="results-sheet__section">
          <h3
            :id="regionsId"
            class="kicker results-sheet__kicker"
          >
            {{ $t('results.sheet.regions') }}
          </h3>

          <ul
            class="results-sheet__rows"
            :aria-labelledby="regionsId"
          >
            <li
              v-for="tally in report.regions"
              :key="tally.region"
            >
              <button
                type="button"
                class="tile results-sheet__region"
                @click="showRegion(tally.region)"
              >
                <span class="results-sheet__region-name">{{ regionNameOf(tally.region) }}</span>

                <span class="results-sheet__region-count">
                  <span aria-hidden="true">{{ tally.right }}/{{ tally.total }}</span>

                  <span class="visually-hidden">· {{ regionScoreTextOf(tally) }} ·</span>
                </span>

                <span
                  class="results-sheet__region-bar"
                  aria-hidden="true"
                >
                  <span
                    class="results-sheet__region-part results-sheet__region-part--right"
                    :style="{ flexGrow: tally.right }"
                  />

                  <span
                    class="results-sheet__region-part results-sheet__region-part--wrong"
                    :style="{ flexGrow: tally.wrong }"
                  />

                  <span
                    class="results-sheet__region-part results-sheet__region-part--missed"
                    :style="{ flexGrow: tally.missed + tally.unreached }"
                  />
                </span>

                <span class="results-sheet__detail">{{ regionDetailOf(tally) }}</span>
              </button>
            </li>
          </ul>
        </div>

        <div
          v-if="mistakeRows.length"
          class="results-sheet__section"
        >
          <h3
            :id="mistakesId"
            class="kicker results-sheet__kicker"
          >
            {{ $t('results.sheet.mistakes') }}
          </h3>

          <ul
            class="results-sheet__rows"
            :aria-labelledby="mistakesId"
          >
            <li
              v-for="row in mistakeRows"
              :key="row.mistake.askedPlaceId"
            >
              <button
                type="button"
                class="tile results-sheet__mistake"
                @click="showPlaces([row.mistake.askedPlaceId, row.mistake.answeredPlaceId])"
              >
                <span class="results-sheet__mistake-pair">
                  <span aria-hidden="true">{{ row.asked }} → {{ row.answered }}</span>

                  <span class="visually-hidden">{{ $t('results.sheet.mistakeText', { asked: row.asked, answered: row.answered }) }} ·</span>
                </span>

                <span
                  class="results-sheet__tag"
                  :class="{ 'results-sheet__tag--classic': row.mistake.tag === 'classic' }"
                >
                  <span aria-hidden="true">{{ row.tag }}</span>

                  <span class="visually-hidden">{{ row.tagSpoken }} ·</span>
                </span>

                <span class="results-sheet__detail">{{ row.prompt }}</span>
              </button>
            </li>
          </ul>
        </div>

        <div
          v-if="isFill && regionsWithGaps.length"
          class="results-sheet__section"
        >
          <h3 class="kicker results-sheet__kicker">
            {{ $t('results.sheet.gaps') }}
          </h3>

          <div
            v-for="tally in regionsWithGaps"
            :key="tally.region"
            class="results-sheet__gap-group"
          >
            <h4 class="results-sheet__gap-region">
              {{ $t('results.sheet.gapRegion', { region: regionNameOf(tally.region), count: tally.unreached }) }}
            </h4>

            <ul
              class="results-sheet__chips"
              :aria-label="regionNameOf(tally.region)"
            >
              <li
                v-for="placeId in tally.unreachedPlaceIds"
                :key="placeId"
              >
                <button
                  type="button"
                  class="results-sheet__chip"
                  @click="showPlaces([placeId])"
                >
                  {{ nameOf(placeId) }}
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div
          v-if="!isFill && report.unreachedPlaceIds.length"
          class="results-sheet__section"
        >
          <h3
            :id="unreachedId"
            class="kicker results-sheet__kicker"
          >
            {{ $t('results.sheet.unreached', { count: report.unreachedPlaceIds.length }) }}
          </h3>

          <ul
            class="results-sheet__chips"
            :aria-labelledby="unreachedId"
          >
            <li
              v-for="placeId in report.unreachedPlaceIds"
              :key="placeId"
            >
              <button
                type="button"
                class="results-sheet__chip"
                @click="showPlaces([placeId])"
              >
                {{ nameOf(placeId) }}
              </button>
            </li>
          </ul>
        </div>

        <p class="results-sheet__time">
          <span aria-hidden="true">{{ $t('record.time', { time: elapsedTime.shown }) }}</span>

          <span class="visually-hidden">{{ $t('record.time', { time: elapsedTime.spoken }) }}</span>
        </p>
      </div>
    </div>

    <ZoomTiles
      ref="zoomTiles"
      class="results-overlay__zoom"
      :class="{ 'results-overlay__zoom--dragging': dragShift !== null }"
      :style="{ bottom: `${visibleTrayHeight + zoomTilesGapPx}px`, visibility: hasRoomForZoomTiles ? undefined : 'hidden' }"
      :inert="!hasRoomForZoomTiles"
      :is-at-min-zoom="isAtMinZoom"
      :is-at-max-zoom="isAtMaxZoom"
      @zoom-in="emit('zoomIn')"
      @zoom-out="emit('zoomOut')"
    />
  </div>
</template>

<style scoped lang="scss">
.results-overlay {
  position: absolute;
  z-index: 1;
  inset: 0;
  pointer-events: none;

  &__zoom {
    position: absolute;
    right: calc(env(safe-area-inset-right, 0px) + 12px);
    pointer-events: auto;
    transition: bottom 340ms cubic-bezier(0.2, 1.1, 0.4, 1);

    &--dragging {
      transition: none;
    }
  }
}

.results-sheet {
  max-width: 520px;
  max-height: calc(100% - env(safe-area-inset-top, 0px) - 72px);
  margin-inline: auto;
  padding: 0;
  overflow: hidden;
  overscroll-behavior: contain;
  user-select: none;
  pointer-events: auto;
  transition: translate 340ms cubic-bezier(0.2, 1.1, 0.4, 1), max-height 340ms cubic-bezier(0.2, 1.1, 0.4, 1);

  &--full {
    overflow-y: auto;
  }

  &--dragging,
  &--unpositioned {
    transition: none;
  }

  &__handle {
    position: sticky;
    top: 0;
    z-index: 3;
    display: grid;
    justify-items: center;
    gap: 4px;
    width: 100%;
    padding: 10px 0 6px;
    border: 0;
    background: $color-paper;
    cursor: pointer;

    &:focus-visible {
      outline-offset: -4px;
      box-shadow: none;
    }
  }

  &__grabber {
    width: 44px;
    height: 5px;
    border-radius: 3px;
    background: $color-ink;
  }

  &__handle-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: $color-muted;
  }

  &__chevron {
    transition: transform 200ms ease-out;
  }

  &--full &__chevron {
    transform: rotate(180deg);
  }

  &__peek {
    display: grid;
    gap: 8px;
    padding: 0 calc(env(safe-area-inset-right, 0px) + 18px) calc(env(safe-area-inset-bottom, 0px) + 14px) calc(env(safe-area-inset-left, 0px) + 18px);
  }

  &__headline {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  &__title {
    margin: 0;
    overflow-wrap: anywhere;
    font-family: $font-serif;
    font-size: 28px;
    font-weight: 900;
    line-height: 1;

    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }

  &__score {
    margin: 0;
    font-family: $font-serif;
    font-size: 28px;
    font-weight: 900;
    line-height: 1;
    white-space: nowrap;

    small {
      font-size: 16px;
    }
  }

  &__new-best {
    justify-self: start;
    margin: 0;
    padding: 4px 10px;
    border: 2px solid $color-ink;
    border-radius: 4px;
    background: $color-mustard;
    font-size: 14px;
    font-weight: 800;
  }

  &__setup {
    margin: 0;
    color: $color-muted;
    font-size: 13px;
    font-weight: 600;
  }

  &__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  &__play-again,
  &__secondary {
    font-family: $font-serif;
    font-weight: 800;
  }

  &__play-again {
    grid-column: 1 / -1;
    min-height: 48px;
    background: $color-green;
    color: $color-surface;
    font-size: 20px;
  }

  &__secondary {
    min-height: 44px;
    padding: 4px 6px;
    font-size: 14px;
  }

  &__more {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
    padding: 14px calc(env(safe-area-inset-right, 0px) + 18px) calc(env(safe-area-inset-bottom, 0px) + 24px) calc(env(safe-area-inset-left, 0px) + 18px);
    border-top: 2px dashed $color-sand;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 90px), 1fr));
    gap: 8px;
  }

  &__stat {
    display: grid;
    gap: 4px;
    padding: 10px 12px 8px;
    box-shadow: 0 3px 0 $color-ink;
  }

  &__stat-value {
    font-family: $font-serif;
    font-size: 26px;
    font-weight: 900;
    line-height: 1;
  }

  &__stat-label {
    color: $color-muted;
    font-size: 11px;
  }

  &__section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  &__kicker {
    color: $color-muted;
  }

  &__rows {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__region,
  &__mistake {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 4px 8px;
    width: 100%;
    padding: 8px 12px 10px;
    text-align: left;
  }

  &__region-name,
  &__region-count {
    font-family: $font-serif;
    font-size: 18px;
    font-weight: 800;
    line-height: 1.1;
  }

  &__region-bar {
    display: flex;
    grid-column: 1 / -1;
    height: 10px;
    overflow: hidden;
    border: 1.5px solid $color-ink;
    border-radius: 3px;
  }

  &__region-part {
    flex-basis: 0;

    &--right {
      background: $color-green;
    }

    &--wrong {
      background: $color-brick;
    }

    &--missed {
      background: $color-sand;
    }
  }

  &__detail {
    grid-column: 1 / -1;
    color: $color-muted;
    font-size: 13px;
    font-weight: 600;
  }

  &__mistake-pair {
    font-size: 16px;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  &__mistake &__detail {
    grid-column: 1;
  }

  &__tag {
    grid-row: 1 / span 2;
    grid-column: 2;
    padding: 3px 7px;
    border: 2px solid $color-ink;
    border-radius: 4px;
    background: $color-surface;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;

    &--classic {
      background: $color-mustard;
    }
  }

  &__gap-group {
    display: grid;
    gap: 6px;
  }

  &__gap-region {
    margin: 0;
    font-family: $font-serif;
    font-size: 17px;
    font-weight: 800;
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__chip {
    min-height: 36px;
    padding: 4px 10px;
    border: 2px solid $color-ink;
    border-radius: 4px;
    background: $color-surface;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  &__time {
    margin: 0;
    color: $color-muted;
    font-size: 14px;
  }
}

.motion-reduced {
  .results-sheet,
  .results-overlay__zoom {
    transition-duration: 120ms;
  }

  .results-sheet__chevron {
    transition: none;
  }
}
</style>
