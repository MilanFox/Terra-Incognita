<script setup lang="ts">
import type { Streak } from '#shared/game/daily';
import { isLearnSetup } from '#shared/game/game';
import type { Mode, RoundSetup } from '#shared/game/game';
import type { DailyRecord } from '#shared/game/records';
import { useBackStep } from '~/composables/useBackSteps';
import { useNextDailyCountdown } from '~/composables/useNextDailyCountdown';
import { useReducedMotion } from '~/composables/useReducedMotion';
import { useTraySwipe } from '~/composables/useTraySwipe';

const props = defineProps<{ lastSetup?: RoundSetup, todaysDaily?: DailyRecord, streak: Streak }>();
const emit = defineEmits<{ playAgain: [], openSetup: [mode: Mode], openDaily: [], interact: [], settings: [], stats: [], about: [] }>();

const liftMs = 180;

const { locale, t } = useI18n();
const { now, shown: nextDailyShown, spoken: nextDailySpoken } = useNextDailyCountdown();
const isMotionReduced = useReducedMotion();

const gridId = useId();
const subtitleId = useId();
const nameSubtitleId = useId();
const capitalSubtitleId = useId();
const countrySubtitleId = useId();
const fillSubtitleId = useId();
const missingSubtitleId = useId();
const wayfinderSubtitleId = useId();
const dailySubtitleId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const body = useTemplateRef<HTMLElement>('body');
const playAgainTile = useTemplateRef<HTMLElement>('playAgainTile');
const dailyTile = useTemplateRef<HTMLButtonElement>('dailyTile');
const grid = useTemplateRef<HTMLElement>('grid');
const dateLine = useTemplateRef<HTMLElement>('dateLine');
const modeTile = useTemplateRef<HTMLButtonElement>('modeTile');
const nameModeTile = useTemplateRef<HTMLButtonElement>('nameModeTile');
const capitalModeTile = useTemplateRef<HTMLButtonElement>('capitalModeTile');
const countryModeTile = useTemplateRef<HTMLButtonElement>('countryModeTile');
const fillModeTile = useTemplateRef<HTMLButtonElement>('fillModeTile');
const missingModeTile = useTemplateRef<HTMLButtonElement>('missingModeTile');
const wayfinderModeTile = useTemplateRef<HTMLButtonElement>('wayfinderModeTile');
const handle = useTemplateRef<HTMLButtonElement>('handle');
const settingsTile = useTemplateRef<HTMLButtonElement>('settingsTile');
const statsTile = useTemplateRef<HTMLButtonElement>('statsTile');
const aboutLink = useTemplateRef<HTMLButtonElement>('aboutLink');

const isOpen = ref(false);
const isLaunching = ref(false);
const collapsedShift = ref(0);
const isPositioned = ref(false);

const dateText = computed(() => new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }).format(now.value));

const playAgainSummary = computed(() => props.lastSetup && [
  t(`setup.regions.${props.lastSetup.region}`),
  t(`setup.tiers.${props.lastSetup.tier}`),
  props.lastSetup.mode === 'wayfinder' ? null : props.lastSetup.roundKind === 'weak' || isLearnSetup(props.lastSetup) ? t(`setup.roundKinds.${props.lastSetup.roundKind}`) : t(`setup.playAgain.deckSizes.${props.lastSetup.deckSize}`),
].filter(Boolean).join(' · '));

const measure = () => {
  if (!tray.value || !grid.value) return;
  const peekHeight = grid.value.offsetTop + tray.value.clientTop;
  collapsedShift.value = Math.max(0, tray.value.offsetHeight - peekHeight);
};

const { dragShift, onPointerDown, onTouchStart, onTouchMove, onTouchEnd, onClickCapture } = useTraySwipe({
  tray,
  isOpen,
  collapsedShift,
});

const trayShift = computed(() => dragShift.value ?? (isOpen.value ? 0 : collapsedShift.value));

useBackStep(() => {
  isOpen.value = false;
  handle.value?.focus({ preventScroll: true });
}, () => isOpen.value);

watch(isOpen, (nowOpen) => {
  if (!nowOpen && tray.value) tray.value.scrollTop = 0;
});

onMounted(() => {
  measure();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    isPositioned.value = true;
  }));
});
useResizeObserver(tray, measure);
watch(locale, () => nextTick(measure));

const { start: startPlay } = useTimeoutFn(() => emit('playAgain'), liftMs, { immediate: false });

const launch = () => {
  if (isLaunching.value) return;
  if (isMotionReduced.value) {
    emit('playAgain');
    return;
  }
  isLaunching.value = true;
  startPlay();
};

defineExpose({
  focus: () => handle.value?.focus({ preventScroll: true }),
  focusModeTile: async (mode: Mode) => {
    isOpen.value = true;
    await nextTick();
    ({ find: modeTile, name: nameModeTile, capital: capitalModeTile, country: countryModeTile, fill: fillModeTile, missing: missingModeTile, wayfinder: wayfinderModeTile })[mode].value?.focus({ preventScroll: true });
  },
  focusSettings: () => settingsTile.value?.focus({ preventScroll: true }),
  focusStats: () => statsTile.value?.focus({ preventScroll: true }),
  focusDailyTile: () => dailyTile.value?.focus({ preventScroll: true }),
  focusAbout: async () => {
    isOpen.value = true;
    await nextTick();
    aboutLink.value?.focus();
  },
});
</script>

<template>
  <section
    ref="tray"
    class="tray home-tray"
    :class="{ 'home-tray--open': isOpen, 'home-tray--dragging': dragShift !== null, 'home-tray--unpositioned': !isPositioned }"
    :style="{ translate: `0 ${trayShift}px` }"
    :aria-label="$t('home.label')"
    @pointerdown="onPointerDown($event); emit('interact')"
    @keydown="emit('interact')"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
    @click.capture="onClickCapture"
  >
    <Teleport to="body">
      <button
        ref="statsTile"
        type="button"
        class="tile stats-tile"
        :aria-label="$t('stats.open')"
        @click="emit('stats')"
      >
        <StatsGlyph />
      </button>

      <button
        ref="settingsTile"
        type="button"
        class="tile settings-tile"
        :aria-label="$t('settings.open')"
        @click="emit('settings')"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          aria-hidden="true"
        >
          <path
            d="M4 7h10M18 7h2M4 17h2M10 17h10"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="square"
          />

          <circle
            cx="16"
            cy="7"
            r="2.5"
            fill="currentColor"
          />

          <circle
            cx="8"
            cy="17"
            r="2.5"
            fill="currentColor"
          />
        </svg>
      </button>
    </Teleport>

    <button
      ref="handle"
      type="button"
      class="home-tray__handle"
      :aria-expanded="isOpen"
      :aria-controls="gridId"
      @click="isOpen = !isOpen"
    >
      <span
        class="home-tray__grabber"
        aria-hidden="true"
      />

      <span class="kicker home-tray__handle-label">
        {{ isOpen ? $t('homeTray.showFewer') : $t('homeTray.showAll') }}

        <svg
          class="home-tray__chevron"
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

    <div
      ref="body"
      class="home-tray__body"
    >
      <p
        ref="dateLine"
        class="kicker home-tray__date"
      >
        {{ dateText }}
      </p>

      <button
        ref="dailyTile"
        type="button"
        class="tile mode-tile daily-tile"
        :class="{ 'daily-tile--played': todaysDaily }"
        :aria-label="$t('daily.title')"
        :aria-describedby="dailySubtitleId"
        @click="emit('openDaily')"
      >
        <span
          class="mode-tile__glyph"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 32 32"
            width="30"
            height="30"
          >
            <circle
              cx="16"
              cy="16"
              r="6"
              fill="currentColor"
            />

            <path
              d="M16 3v5M16 24v5M3 16h5M24 16h5M6.8 6.8l3.5 3.5M21.7 21.7l3.5 3.5M6.8 25.2l3.5-3.5M21.7 10.3l3.5-3.5"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
            />
          </svg>
        </span>

        <span class="mode-tile__text">
          <span class="mode-tile__name">{{ $t('daily.title') }}</span>

          <span
            :id="dailySubtitleId"
            class="mode-tile__subtitle daily-tile__lines"
          >
            <span v-if="todaysDaily">{{ $t('daily.today', { score: todaysDaily.score, total: todaysDaily.deckSize }) }}</span>

            <span v-else>{{ $t('daily.subtitle') }}</span>

            <span class="visually-hidden"> · </span>

            <span>{{ $t('daily.streakLine', { count: streak.current }, streak.current) }}</span>

            <template v-if="todaysDaily">
              <span aria-hidden="true">{{ $t('daily.next', { time: nextDailyShown }) }}</span>

              <span class="visually-hidden">· {{ $t('daily.next', { time: nextDailySpoken }) }}</span>
            </template>
          </span>
        </span>
      </button>

      <button
        v-if="lastSetup"
        ref="playAgainTile"
        type="button"
        class="tile mode-tile play-again-tile"
        :class="{ 'mode-tile--launching': isLaunching }"
        @click="launch"
      >
        <span
          class="mode-tile__glyph"
          aria-hidden="true"
        >
          <ModeGlyph :mode="lastSetup.mode" />
        </span>

        <span class="mode-tile__text">
          <span class="kicker">{{ $t('setup.playAgain.label') }}</span>

          <span class="mode-tile__name">{{ $t(`modes.${lastSetup.mode}.name`) }}</span>

          <span class="mode-tile__subtitle">{{ playAgainSummary }}</span>
        </span>
      </button>

      <div
        :id="gridId"
        ref="grid"
        class="home-tray__grid"
        :inert="!isOpen"
      >
        <button
          ref="modeTile"
          type="button"
          class="tile mode-tile"
          :aria-label="$t('modes.find.name')"
          :aria-describedby="subtitleId"
          @click="emit('openSetup', 'find')"
        >
          <span
            class="mode-tile__glyph"
            aria-hidden="true"
          >
            <ModeGlyph mode="find" />
          </span>

          <span class="mode-tile__text">
            <span class="mode-tile__name">{{ $t('modes.find.name') }}</span>

            <span
              :id="subtitleId"
              class="mode-tile__subtitle"
            >{{ $t('modes.find.subtitle') }}</span>
          </span>
        </button>

        <button
          ref="nameModeTile"
          type="button"
          class="tile mode-tile"
          :aria-label="$t('modes.name.name')"
          :aria-describedby="nameSubtitleId"
          @click="emit('openSetup', 'name')"
        >
          <span
            class="mode-tile__glyph"
            aria-hidden="true"
          >
            <ModeGlyph mode="name" />
          </span>

          <span class="mode-tile__text">
            <span class="mode-tile__name">{{ $t('modes.name.name') }}</span>

            <span
              :id="nameSubtitleId"
              class="mode-tile__subtitle"
            >{{ $t('modes.name.subtitle') }}</span>
          </span>
        </button>

        <button
          ref="capitalModeTile"
          type="button"
          class="tile mode-tile"
          :aria-label="$t('modes.capital.name')"
          :aria-describedby="capitalSubtitleId"
          @click="emit('openSetup', 'capital')"
        >
          <span
            class="mode-tile__glyph"
            aria-hidden="true"
          >
            <ModeGlyph mode="capital" />
          </span>

          <span class="mode-tile__text">
            <span class="mode-tile__name">{{ $t('modes.capital.name') }}</span>

            <span
              :id="capitalSubtitleId"
              class="mode-tile__subtitle"
            >{{ $t('modes.capital.subtitle') }}</span>
          </span>
        </button>

        <button
          ref="countryModeTile"
          type="button"
          class="tile mode-tile"
          :aria-label="$t('modes.country.name')"
          :aria-describedby="countrySubtitleId"
          @click="emit('openSetup', 'country')"
        >
          <span
            class="mode-tile__glyph"
            aria-hidden="true"
          >
            <ModeGlyph mode="country" />
          </span>

          <span class="mode-tile__text">
            <span class="mode-tile__name">{{ $t('modes.country.name') }}</span>

            <span
              :id="countrySubtitleId"
              class="mode-tile__subtitle"
            >{{ $t('modes.country.subtitle') }}</span>
          </span>
        </button>

        <button
          ref="fillModeTile"
          type="button"
          class="tile mode-tile"
          :aria-label="$t('modes.fill.name')"
          :aria-describedby="fillSubtitleId"
          @click="emit('openSetup', 'fill')"
        >
          <span
            class="mode-tile__glyph"
            aria-hidden="true"
          >
            <ModeGlyph mode="fill" />
          </span>

          <span class="mode-tile__text">
            <span class="mode-tile__name">{{ $t('modes.fill.name') }}</span>

            <span
              :id="fillSubtitleId"
              class="mode-tile__subtitle"
            >{{ $t('modes.fill.subtitle') }}</span>
          </span>
        </button>

        <button
          ref="missingModeTile"
          type="button"
          class="tile mode-tile"
          :aria-label="$t('modes.missing.name')"
          :aria-describedby="missingSubtitleId"
          @click="emit('openSetup', 'missing')"
        >
          <span
            class="mode-tile__glyph"
            aria-hidden="true"
          >
            <ModeGlyph mode="missing" />
          </span>

          <span class="mode-tile__text">
            <span class="mode-tile__name">{{ $t('modes.missing.name') }}</span>

            <span
              :id="missingSubtitleId"
              class="mode-tile__subtitle"
            >{{ $t('modes.missing.subtitle') }}</span>
          </span>
        </button>

        <button
          ref="wayfinderModeTile"
          type="button"
          class="tile mode-tile"
          :aria-label="$t('modes.wayfinder.name')"
          :aria-describedby="wayfinderSubtitleId"
          @click="emit('openSetup', 'wayfinder')"
        >
          <span
            class="mode-tile__glyph"
            aria-hidden="true"
          >
            <ModeGlyph mode="wayfinder" />
          </span>

          <span class="mode-tile__text">
            <span class="mode-tile__name">{{ $t('modes.wayfinder.name') }}</span>

            <span
              :id="wayfinderSubtitleId"
              class="mode-tile__subtitle"
            >{{ $t('modes.wayfinder.subtitle') }}</span>
          </span>
        </button>

        <button
          ref="aboutLink"
          type="button"
          class="home-tray__about"
          @click="emit('about')"
        >
          {{ $t('about.open') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.settings-tile {
  position: fixed;
  z-index: 1;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  right: calc(env(safe-area-inset-right, 0px) + 12px);
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
}

.stats-tile {
  position: fixed;
  z-index: 1;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: calc(env(safe-area-inset-left, 0px) + 12px);
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
}

.home-tray {
  max-width: 520px;
  max-height: calc(100% - env(safe-area-inset-top, 0px) - 72px);
  margin-inline: auto;
  padding: 0;
  overflow: hidden;
  overscroll-behavior: contain;
  user-select: none;
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
    padding: 0 calc(env(safe-area-inset-right, 0px) + 18px) calc(env(safe-area-inset-bottom, 0px) + 20px) calc(env(safe-area-inset-left, 0px) + 18px);
  }

  &__date {
    padding-block: 4px;
    font-size: 14px;
    letter-spacing: 0.04em;
  }

  &__date + .daily-tile,
  .daily-tile + .play-again-tile {
    margin-top: 12px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
    gap: 12px;
    margin-top: calc(env(safe-area-inset-bottom, 0px) + 18px);
  }

  &__about {
    grid-column: 1 / -1;
    justify-self: center;
    min-height: 44px;
    padding: 0 8px;
    border: 0;
    background: none;
    color: $color-muted;
    font-size: 15px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
}

.motion-reduced {
  .home-tray {
    transition-duration: 120ms;
  }

  .home-tray__chevron {
    transition: none;
  }
}

.mode-tile {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 132px;
  padding: 12px;
  background: $color-mustard;
  text-align: left;

  &.play-again-tile,
  &.daily-tile {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-height: 0;
  }

  .daily-tile__lines {
    display: grid;
  }

  &.daily-tile {
    background: $color-green;
    color: $color-surface;

    &.daily-tile--played {
      background: $color-sand;
      color: $color-ink;
    }
  }

  &--launching {
    transform: translateY(-6px) scale(1.02);
    box-shadow: 0 10px 0 $color-ink;
    transition: transform 180ms cubic-bezier(0.2, 1.4, 0.4, 1), box-shadow 180ms ease-out;
  }

  &__glyph {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 4px;
    background: $color-ink;
    color: $color-mustard;
  }

  &__text {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  &__name {
    font-family: $font-serif;
    font-size: 22px;
    font-weight: 800;
    line-height: 1;
    overflow-wrap: anywhere;
  }

  &__subtitle {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.25;
  }
}
</style>
