<script setup lang="ts">
import { useTraySwipe } from '~/composables/useTraySwipe';

const emit = defineEmits<{ play: [], interact: [] }>();

const liftMs = 180;

const { locale } = useI18n();
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

const gridId = useId();
const subtitleId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const body = useTemplateRef<HTMLElement>('body');
const dateLine = useTemplateRef<HTMLElement>('dateLine');
const handle = useTemplateRef<HTMLButtonElement>('handle');

const isOpen = ref(false);
const isLaunching = ref(false);
const collapsedShift = ref(0);

const dateText = computed(() => new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()));

const measure = () => {
  if (!tray.value || !body.value || !dateLine.value) return;
  const peekHeight = dateLine.value.offsetTop + dateLine.value.offsetHeight + Number.parseFloat(getComputedStyle(body.value).paddingBottom);
  collapsedShift.value = Math.max(0, tray.value.offsetHeight - peekHeight);
};

const { dragShift, onPointerDown, onTouchStart, onTouchMove, onTouchEnd, onClickCapture } = useTraySwipe({
  tray,
  isOpen,
  collapsedShift,
});

const trayShift = computed(() => dragShift.value ?? (isOpen.value ? 0 : collapsedShift.value));

watch(isOpen, (nowOpen) => {
  if (!nowOpen && tray.value) tray.value.scrollTop = 0;
});

onMounted(measure);
useResizeObserver(tray, measure);
watch(locale, () => nextTick(measure));

const { start: startPlay } = useTimeoutFn(() => emit('play'), liftMs, { immediate: false });

const launch = () => {
  if (isLaunching.value) return;
  if (prefersReducedMotion.value) {
    emit('play');
    return;
  }
  isLaunching.value = true;
  startPlay();
};

defineExpose({ focus: () => handle.value?.focus({ preventScroll: true }) });
</script>

<template>
  <section
    ref="tray"
    class="tray home-tray"
    :class="{ 'home-tray--open': isOpen, 'home-tray--dragging': dragShift !== null }"
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

      <div
        :id="gridId"
        class="home-tray__grid"
        :inert="!isOpen"
      >
        <button
          type="button"
          class="tile mode-tile"
          :class="{ 'mode-tile--launching': isLaunching }"
          :aria-label="$t('modes.find.name')"
          :aria-describedby="subtitleId"
          @click="launch"
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
              <path
                d="M16 3a9 9 0 0 0-9 9c0 6.5 9 17 9 17s9-10.5 9-17a9 9 0 0 0-9-9z"
                fill="currentColor"
              />

              <circle
                class="mode-tile__pin-dot"
                cx="16"
                cy="12"
                r="3.4"
              />
            </svg>
          </span>

          <span class="mode-tile__text">
            <span class="mode-tile__name">{{ $t('modes.find.name') }}</span>

            <span
              :id="subtitleId"
              class="mode-tile__subtitle"
            >{{ $t('modes.find.subtitle') }}</span>
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
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

  &--dragging {
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

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-top: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
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

  &__pin-dot {
    fill: $color-ink;
  }

  &__text {
    display: grid;
    gap: 4px;
  }

  &__name {
    font-family: $font-serif;
    font-size: 22px;
    font-weight: 800;
    line-height: 1;
  }

  &__subtitle {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.25;
  }
}
</style>
