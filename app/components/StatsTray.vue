<script setup lang="ts">
import type { Mode, Region } from '#shared/game/game';
import { regularModes, specialModes } from '#shared/game/stats';
import type { StatsScope } from '#shared/game/stats';
import type { ShownVariant } from '~/components/StatsModePage.vue';
import { useTraySwipe } from '~/composables/useTraySwipe';
import { useGameStore } from '~/stores/game';

type StatsPageId = 'all' | Mode;

const props = defineProps<{ mapCanvas?: HTMLElement | null, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ close: [], zoomIn: [], zoomOut: [], flyToRegion: [region: Region], announce: [text: string] }>();

const zoomTilesGapPx = 12;
const zoomTilesRoomPx = 120;

const { t, locale } = useI18n();
const game = useGameStore();
const { height: windowHeight } = useWindowSize();

const titleId = useId();
const moreId = useId();
const overlay = useTemplateRef<HTMLElement>('overlay');
const tray = useTemplateRef<HTMLElement>('tray');
const title = useTemplateRef<HTMLHeadingElement>('title');
const activePage = useTemplateRef<{ more: HTMLElement | null }>('activePage');
const placeBubble = useTemplateRef<{ bottom: number, lines: string[] }>('placeBubble');

const allGames = game.allGamesStats();
const pages = computed<{ id: StatsPageId, name: string }[]>(() => [
  { id: 'all', name: t('stats.allGames.name') },
  ...[...regularModes, ...specialModes].map(mode => ({ id: mode, name: t(`modes.${mode}.name`) })),
]);
const activePageId = ref<StatsPageId>('all');
const shownVariants = reactive<Partial<Record<Mode, ShownVariant>>>({});
const slideFrom = ref<'left' | 'right' | null>(null);

const scope = computed<StatsScope>(() => {
  if (activePageId.value === 'all') return {};
  const shownVariant = shownVariants[activePageId.value] ?? 'all';
  return { mode: activePageId.value, variant: shownVariant === 'all' ? undefined : shownVariant };
});
const modeStats = computed(() => (activePageId.value === 'all' ? null : game.modeStats({ ...scope.value, mode: activePageId.value })));
const regions = computed(() => (isSpecialPage.value ? [] : game.regionCounts(scope.value)));
const isSpecialPage = computed(() => specialModes.includes(activePageId.value as Mode));
const placeRatings = computed(() => {
  if (isSpecialPage.value) return null;
  return activePageId.value === 'all' ? allGames.placeRatings : game.placeRatings(scope.value);
});

const isOpen = ref(false);
const bubblePlaceId = ref<string | null>(null);
const bubbleDetails = computed(() => (bubblePlaceId.value ? game.placeDetails(bubblePlaceId.value, scope.value) : null));
const bubbleConfusedWithId = computed(() => bubbleDetails.value?.confusedWith);
const isPositioned = ref(false);
const collapsedShift = ref(0);
const peekHeight = ref(0);
const trayHeight = ref(0);

const measure = () => {
  const more = activePage.value?.more;
  if (!tray.value || !more) return;
  peekHeight.value = Math.round(more.getBoundingClientRect().top - tray.value.getBoundingClientRect().top + tray.value.scrollTop);
  trayHeight.value = tray.value.offsetHeight;
  collapsedShift.value = Math.max(0, trayHeight.value - peekHeight.value);
};

const pageIndexOf = (pageId: StatsPageId) => pages.value.findIndex(({ id }) => id === pageId);

const stepPage = (step: 1 | -1) => {
  const next = pages.value[pageIndexOf(activePageId.value) + step];
  if (next) activePageId.value = next.id;
};

const { dragShift, onPointerDown, onTouchStart, onTouchMove, onTouchEnd, onClickCapture } = useTraySwipe({
  tray,
  isOpen,
  collapsedShift,
  onSwipeLeft: () => stepPage(1),
  onSwipeRight: () => stepPage(-1),
});

const trayShift = computed(() => dragShift.value ?? (isOpen.value ? 0 : collapsedShift.value));
const visibleTrayHeight = computed(() => trayHeight.value - trayShift.value);
const hasRoomForZoomTiles = computed(() => windowHeight.value - visibleTrayHeight.value >= zoomTilesRoomPx);

watch(isOpen, (nowOpen) => {
  if (!nowOpen && tray.value) tray.value.scrollTop = 0;
});

const placeLabel = (placeId: string) => isSpecialPage.value ? game.nameOf(placeId, locale.value) : t('live.statsPlace', { name: game.nameOf(placeId, locale.value), rating: t(`stats.ratings.${game.placeDetails(placeId, scope.value).rating}`) });

const openBubble = async (placeId: string) => {
  if (isSpecialPage.value) return;
  bubblePlaceId.value = placeId;
  await nextTick();
  const { rating } = game.placeDetails(placeId, scope.value);
  emit('announce', [game.nameOf(placeId, locale.value), rating === 'noData' ? '' : t(`stats.ratings.${rating}`), ...placeBubble.value?.lines ?? []].filter(Boolean).join('. '));
};

const closeBubble = () => {
  if (overlay.value?.querySelector('.place-bubble')?.contains(document.activeElement)) props.mapCanvas?.focus();
  bubblePlaceId.value = null;
};

watch(activePageId, (pageId, previousPageId) => {
  slideFrom.value = pageIndexOf(pageId) > pageIndexOf(previousPageId) ? 'right' : 'left';
  closeBubble();
  nextTick(measure);
});

const flyToRegion = (region: Region) => {
  closeBubble();
  isOpen.value = false;
  tray.value?.querySelector<HTMLElement>('.stats-tray__handle')?.focus({ preventScroll: true });
  emit('flyToRegion', region);
};

const focusCycle = () => {
  const inTray = [...overlay.value?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [tabindex="0"]') ?? []]
    .filter(element => !element.closest('[inert]') && element.getClientRects().length > 0);
  return props.mapCanvas ? [...inTray, props.mapCanvas] : inTray;
};

// The dialog is the page's map scope, which also holds the live region; Tab is stepped by hand so it only cycles through this tray and the map.
const trapFocus = (event: KeyboardEvent) => {
  const cycle = focusCycle();
  const active = document.activeElement as HTMLElement | null;
  if (cycle.length === 0) return;
  event.preventDefault();
  const index = active ? cycle.indexOf(active) : -1;
  if (index !== -1) {
    cycle[(index + (event.shiftKey ? cycle.length - 1 : 1)) % cycle.length]!.focus();
    return;
  }
  const isInTray = !!active && !!overlay.value?.contains(active);
  const following = isInTray ? cycle.filter(element => active!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) : [];
  const preceding = isInTray ? cycle.filter(element => !following.includes(element)) : [];
  (event.shiftKey ? preceding.at(-1) ?? cycle.at(-1) : following[0] ?? cycle[0])!.focus();
};

useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (bubblePlaceId.value) closeBubble();
    else emit('close');
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

defineExpose({ titleId, isSpecialPage, peekHeight, visibleTrayHeight, placeRatings, openBubble, placeLabel, bubblePlaceId, bubbleBottom: computed(() => (bubblePlaceId.value ? placeBubble.value?.bottom ?? 0 : 0)) });
</script>

<template>
  <div
    ref="overlay"
    class="stats-overlay"
  >
    <StatsPlaceBubble
      v-if="bubblePlaceId && bubbleDetails"
      ref="placeBubble"
      :place-name="game.nameOf(bubblePlaceId, locale)"
      :details="bubbleDetails"
      :confused-with-name="bubbleConfusedWithId && game.nameOf(bubbleConfusedWithId, locale)"
      @close="closeBubble"
    />

    <div
      ref="tray"
      class="tray stats-tray"
      :class="{ 'stats-tray--open': isOpen, 'stats-tray--dragging': dragShift !== null, 'stats-tray--unpositioned': !isPositioned }"
      :style="{ translate: `0 ${trayShift}px` }"
      @pointerdown="onPointerDown"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
      @click.capture="onClickCapture"
    >
      <button
        type="button"
        class="stats-tray__handle"
        :aria-expanded="isOpen"
        :aria-controls="moreId"
        @click="isOpen = !isOpen"
      >
        <span
          class="stats-tray__grabber"
          aria-hidden="true"
        />

        <span class="kicker stats-tray__handle-label">
          {{ isOpen ? $t('stats.showLess') : $t('stats.showMore') }}

          <svg
            class="stats-tray__chevron"
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

      <div class="stats-tray__body">
        <div class="stats-tray__top">
          <button
            type="button"
            class="tile stats-tray__close"
            :aria-label="$t('stats.close')"
            @click="emit('close')"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden="true"
            >
              <path
                d="M5 5l14 14M19 5L5 19"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="square"
              />
            </svg>
          </button>
        </div>

        <h2
          :id="titleId"
          ref="title"
          class="stats-tray__title"
          tabindex="-1"
        >
          {{ $t('stats.title') }}
        </h2>

        <StatsTabs
          v-model="activePageId"
          :pages="pages"
          :label="$t('stats.pages')"
        >
          <template #glyph="{ pageId }">
            <StatsGlyph
              v-if="pageId === 'all'"
              :size="20"
            />

            <ModeGlyph
              v-else
              :mode="pageId"
              :size="22"
            />
          </template>

          <template #default="{ pageId }">
            <div
              class="stats-tray__page"
              :class="slideFrom && `stats-tray__page--from-${slideFrom}`"
            >
              <StatsAllGames
                v-if="pageId === 'all'"
                ref="activePage"
                :stats="allGames"
                :streak="game.streak"
                :more-id="moreId"
                :is-expanded="isOpen"
                :regions="regions"
                @fly-to-region="flyToRegion"
              />

              <StatsSpecialPage
                v-else-if="modeStats && isSpecialPage"
                ref="activePage"
                :mode="pageId"
                :stats="modeStats"
                :more-id="moreId"
                :is-expanded="isOpen"
              />

              <StatsModePage
                v-else-if="modeStats"
                ref="activePage"
                :shown-variant="shownVariants[pageId] ?? 'all'"
                :mode="pageId"
                :stats="modeStats"
                :more-id="moreId"
                :is-expanded="isOpen"
                :regions="regions"
                @fly-to-region="flyToRegion"
                @update:shown-variant="shownVariants[pageId] = $event"
              />
            </div>
          </template>
        </StatsTabs>
      </div>
    </div>

    <ZoomTiles
      v-show="hasRoomForZoomTiles"
      class="stats-overlay__zoom"
      :class="{ 'stats-overlay__zoom--dragging': dragShift !== null }"
      :style="{ bottom: `${visibleTrayHeight + zoomTilesGapPx}px` }"
      :is-at-min-zoom="isAtMinZoom"
      :is-at-max-zoom="isAtMaxZoom"
      @zoom-in="emit('zoomIn')"
      @zoom-out="emit('zoomOut')"
    />
  </div>
</template>

<style scoped lang="scss">
.stats-overlay {
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

.stats-tray {
  max-width: 520px;
  max-height: calc(100% - env(safe-area-inset-top, 0px) - 72px);
  margin-inline: auto;
  padding: 0;
  overflow: hidden;
  overscroll-behavior: contain;
  user-select: none;
  pointer-events: auto;
  transition: translate 340ms cubic-bezier(0.2, 1.1, 0.4, 1);

  &--open {
    overflow-y: auto;
  }

  &--dragging,
  &--unpositioned {
    transition: none;
  }

  &__handle {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    justify-items: center;
    gap: 4px;
    width: 100%;
    padding: 10px 0 6px;
    border: 0;
    background: $color-paper;
    cursor: pointer;
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

  &--open &__chevron {
    transform: rotate(180deg);
  }

  &__body {
    display: grid;
    gap: 10px;
    padding: 0 calc(env(safe-area-inset-right, 0px) + 18px) calc(env(safe-area-inset-bottom, 0px) + 20px) calc(env(safe-area-inset-left, 0px) + 18px);
  }

  &__top {
    display: flex;
    justify-content: flex-end;
  }

  &__close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
  }

  &__page {
    &--from-right {
      animation: stats-page-from-right 220ms cubic-bezier(0.2, 1, 0.4, 1);
    }

    &--from-left {
      animation: stats-page-from-left 220ms cubic-bezier(0.2, 1, 0.4, 1);
    }
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
}

@keyframes stats-page-from-right {
  from {
    opacity: 0;
    translate: 40px 0;
  }
}

@keyframes stats-page-from-left {
  from {
    opacity: 0;
    translate: -40px 0;
  }
}

.motion-reduced {
  .stats-tray__page {
    animation: none;
  }

  .stats-tray,
  .stats-overlay__zoom {
    transition-duration: 120ms;
  }

  .stats-tray__chevron {
    transition: none;
  }
}
</style>
