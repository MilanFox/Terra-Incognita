<script setup lang="ts">
import type { Tier } from '#shared/game/game';
import { useReducedMotion } from '~/composables/useReducedMotion';
import { useGameStore } from '~/stores/game';

export type AboutSectionId = 'intro' | 'borders' | 'tiers' | 'ukraine' | 'westernSahara' | 'capitals' | 'flags' | 'leases' | 'unclaimed' | 'sources';

type Bounds = [[number, number], [number, number]];

interface ShippedVersion {
  dataVersion: number
  ne: string
  builtAt: string
  counts: Record<Tier, number>
  sources: { cldr: string, wikidataDate: string }
}

interface FlagCredit {
  id: string
  file: string
  artist: string | null
  license: string | null
  licenseUrl: string | null
}

const props = defineProps<{ openingSection: AboutSectionId, openingPlaceId?: string, backLabel?: string, mapCanvas?: HTMLElement | null, isAtMinZoom: boolean, isAtMaxZoom: boolean }>();
const emit = defineEmits<{ close: [], zoomIn: [], zoomOut: [], flyTo: [bounds: Bounds] }>();

const sectionIds: AboutSectionId[] = ['intro', 'borders', 'tiers', 'ukraine', 'westernSahara', 'capitals', 'flags', 'leases', 'unclaimed', 'sources'];
const tiers: Tier[] = ['sovereign', 'defacto', 'dependencies'];
const sourceLineKeys = ['borders', 'names', 'aliases', 'capitals', 'flags', 'rulings'];
const rulingFrames: Partial<Record<AboutSectionId, Bounds>> = {
  ukraine: [[31.5, 44], [38.5, 47]],
  westernSahara: [[-17.5, 20.5], [-8, 28]],
  capitals: [[34.2, 31], [35.9, 32.6]],
  flags: [[60.5, 29.4], [74.9, 38.5]],
  leases: [[-77, 19.5], [-74, 21]],
  unclaimed: [[32.5, 21.2], [35, 22.6]],
};
const placeNoteFrames: Record<string, Bounds> = {
  KAZ: [[46.5, 40.5], [87.3, 55.5]],
  CYP: [[32.2, 34.5], [34.6, 35.7]],
  GBR: [[68, -8], [81, 9]],
};
const feedbackUrl = 'https://github.com/MilanFox/Terra-Incognita/issues';
const noticesUrl = '/data/THIRD-PARTY-NOTICES.txt';
const zoomTilesGapPx = 12;
const zoomTilesRoomPx = 120;

const fetchJson = async (url: string) => (await fetch(url)).json();

const { t, locale } = useI18n();
const game = useGameStore();
const isMotionReduced = useReducedMotion();
const { height: windowHeight } = useWindowSize();

const titleId = useId();
const idBase = useId();
const showOnMapId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const title = useTemplateRef<HTMLHeadingElement>('title');
const backButton = useTemplateRef<HTMLButtonElement>('backButton');
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton');
const shippedVersion = shallowRef<ShippedVersion>();
const flagCredits = shallowRef<FlagCredit[]>([]);
const trayHeight = ref(0);

const hasRoomForZoomTiles = computed(() => windowHeight.value - trayHeight.value >= zoomTilesRoomPx);

const headingIdOf = (sectionId: AboutSectionId) => `${idBase}-${sectionId}`;

const dateText = (isoDate: string) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(isoDate));

const sourceLines = computed(() => {
  if (!shippedVersion.value) return [];
  const { ne, sources } = shippedVersion.value;
  return sourceLineKeys.map(key => t(`about.sections.sources.${key}`, { ne, cldr: sources.cldr, wikidataDate: dateText(sources.wikidataDate) }));
});

const commonsFileUrl = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(' ', '_'))}`;

const flyToRuling = (sectionId: AboutSectionId, placeId?: string) => {
  const frame = (placeId && placeNoteFrames[placeId]) || rulingFrames[sectionId];
  if (frame) emit('flyTo', frame);
};

const showSection = (sectionId: AboutSectionId) => {
  const heading = document.getElementById(headingIdOf(sectionId));
  heading?.scrollIntoView({ behavior: isMotionReduced.value ? 'instant' : 'smooth', block: 'start' });
  heading?.focus({ preventScroll: true });
};

const measure = () => {
  if (tray.value) trayHeight.value = tray.value.offsetHeight;
};

const trapFocus = (event: KeyboardEvent) => {
  const first = backButton.value ?? closeButton.value!;
  const last = props.mapCanvas ?? first;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === title.value)) {
    event.preventDefault();
    last.focus();
  }
  else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};

useEventListener(document, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
  else if (event.key === 'Tab') trapFocus(event);
});

onMounted(async () => {
  measure();
  title.value?.focus({ preventScroll: true });
  await nextTick();
  flyToRuling(props.openingSection, props.openingPlaceId);
  try {
    [shippedVersion.value, flagCredits.value] = await Promise.all([fetchJson('/data/version.json'), fetchJson('/data/credits.json')]);
  }
  catch {
    return;
  }
  await nextTick();
  if (!tray.value || props.openingSection === 'intro') return;
  document.getElementById(headingIdOf(props.openingSection))?.scrollIntoView({ behavior: 'instant', block: 'start' });
});
useResizeObserver(tray, measure);

defineExpose({ titleId, trayHeight });
</script>

<template>
  <div class="about-overlay">
    <div
      ref="tray"
      class="tray about-tray"
    >
      <div class="about-tray__top">
        <button
          v-if="backLabel"
          ref="backButton"
          type="button"
          class="tile about-tray__back"
          @click="emit('close')"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
          >
            <path
              d="M20 12H5M11 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="square"
            />
          </svg>

          {{ backLabel }}
        </button>

        <button
          ref="closeButton"
          type="button"
          class="tile about-tray__close"
          :aria-label="$t('about.close')"
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

      <div class="about-tray__body">
        <h2
          :id="titleId"
          ref="title"
          class="about-tray__title"
          tabindex="-1"
        >
          {{ $t('about.title') }}
        </h2>

        <nav :aria-label="$t('about.index')">
          <ul class="about-tray__index">
            <li
              v-for="sectionId in sectionIds"
              :key="sectionId"
            >
              <a
                class="tile about-tray__index-tile"
                :href="`#${headingIdOf(sectionId)}`"
                @click.prevent="showSection(sectionId)"
              >
                {{ $t(`about.sections.${sectionId}.heading`) }}
              </a>
            </li>
          </ul>
        </nav>

        <span
          :id="showOnMapId"
          hidden
        >{{ $t('about.showOnMap') }}</span>

        <template v-if="shippedVersion">
          <section
            v-for="sectionId in sectionIds"
            :key="sectionId"
            class="about-tray__section"
          >
            <h3
              :id="headingIdOf(sectionId)"
              class="about-tray__heading"
              tabindex="-1"
            >
              <button
                v-if="rulingFrames[sectionId]"
                type="button"
                class="about-tray__ruling"
                :aria-describedby="showOnMapId"
                @click="flyToRuling(sectionId)"
              >
                {{ $t(`about.sections.${sectionId}.heading`) }}

                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  aria-hidden="true"
                >
                  <path
                    d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  />

                  <circle
                    cx="12"
                    cy="9"
                    r="2.5"
                    fill="currentColor"
                  />
                </svg>
              </button>

              <template v-else>
                {{ $t(`about.sections.${sectionId}.heading`) }}
              </template>
            </h3>

            <template v-if="sectionId === 'tiers'">
              <p>{{ $t('about.sections.tiers.lead') }}</p>

              <ul class="about-tray__list">
                <i18n-t
                  v-for="tier in tiers"
                  :key="tier"
                  :keypath="`about.sections.tiers.${tier}`"
                  tag="li"
                  scope="global"
                >
                  <template #tier>
                    <strong>{{ $t(`setup.tiers.${tier}`) }}</strong>
                  </template>

                  <template #count>{{ shippedVersion.counts[tier] }}</template>
                </i18n-t>
              </ul>

              <p>{{ $t('about.sections.tiers.text') }}</p>
            </template>

            <template v-else-if="sectionId === 'sources'">
              <ul class="about-tray__list">
                <li
                  v-for="line in sourceLines"
                  :key="line"
                >
                  {{ line }}
                </li>
              </ul>

              <p>{{ $t('about.sections.sources.version', { dataVersion: shippedVersion.dataVersion, builtAt: dateText(shippedVersion.builtAt) }) }}</p>

              <p>
                <a
                  :href="noticesUrl"
                  target="_blank"
                >{{ $t('about.sections.sources.licences') }}<span class="visually-hidden"> {{ $t('about.newTab') }}</span></a>
              </p>

              <ul
                v-if="flagCredits.length > 0"
                class="about-tray__credits"
              >
                <i18n-t
                  v-for="credit in flagCredits"
                  :key="credit.id"
                  keypath="about.sections.sources.flagCredit"
                  tag="li"
                  scope="global"
                >
                  <template #flag>
                    <a
                      :href="commonsFileUrl(credit.file)"
                      target="_blank"
                      rel="noopener"
                    >{{ $t('about.sections.sources.flagOf', { place: game.nameOf(credit.id, locale) }) }}<span class="visually-hidden"> {{ $t('about.newTab') }}</span></a>
                  </template>

                  <template #artist>{{ credit.artist ?? $t('about.sections.sources.commonsContributors') }}</template>

                  <template #licence>
                    <a
                      v-if="credit.licenseUrl"
                      :href="credit.licenseUrl"
                      target="_blank"
                      rel="noopener"
                    >{{ credit.license }}<span class="visually-hidden"> {{ $t('about.newTab') }}</span></a>

                    <template v-else>{{ credit.license }}</template>
                  </template>
                </i18n-t>
              </ul>
            </template>

            <p v-else>
              {{ $t(`about.sections.${sectionId}.text`) }}
            </p>
          </section>

          <p class="about-tray__feedback">
            <a
              :href="feedbackUrl"
              target="_blank"
              rel="noopener"
            >{{ $t('about.feedback') }}<span class="visually-hidden"> {{ $t('about.newTab') }}</span></a>
          </p>
        </template>
      </div>
    </div>

    <ZoomTiles
      v-show="hasRoomForZoomTiles"
      class="about-overlay__zoom"
      :style="{ bottom: `${trayHeight + zoomTilesGapPx}px` }"
      :is-at-min-zoom="isAtMinZoom"
      :is-at-max-zoom="isAtMaxZoom"
      @zoom-in="emit('zoomIn')"
      @zoom-out="emit('zoomOut')"
    />
  </div>
</template>

<style scoped lang="scss">
.about-overlay {
  position: absolute;
  z-index: 1;
  inset: 0;
  pointer-events: none;

  &__zoom {
    position: absolute;
    right: calc(env(safe-area-inset-right, 0px) + 12px);
    pointer-events: auto;
  }
}

.about-tray {
  max-width: 520px;
  height: calc(100% * 2 / 3);
  margin-inline: auto;
  padding: 0;
  overflow: hidden auto;
  overscroll-behavior: contain;
  scroll-padding-top: 72px;
  pointer-events: auto;

  &__top {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 12px calc(env(safe-area-inset-right, 0px) + 18px) 8px;
    background: $color-paper;
  }

  &__back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    margin-right: auto;
    padding: 4px 14px 4px 10px;
    font-size: 15px;
    font-weight: 700;
  }

  &__close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
  }

  &__body {
    display: grid;
    gap: 14px;
    padding: 0 calc(env(safe-area-inset-right, 0px) + 18px) calc(env(safe-area-inset-bottom, 0px) + 24px) calc(env(safe-area-inset-left, 0px) + 18px);
    font-size: 16px;
    line-height: 1.45;

    p {
      margin: 0;
    }

    a {
      color: inherit;
      text-underline-offset: 3px;
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

  &__index {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 8px;
    margin: 0;
    padding: 0 0 4px;
    list-style: none;
  }

  &__index-tile {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 4px 12px;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
    text-decoration: none;
    touch-action: manipulation;

    &:active {
      transform: translateY(3px);
      box-shadow: 0 1px 0 $color-ink;
    }
  }

  &__section {
    display: grid;
    gap: 8px;
    padding-top: 10px;
    border-top: 2px solid $color-sand;
  }

  &__heading {
    margin: 0;
    font-family: $font-serif;
    font-size: 21px;
    font-weight: 800;
    line-height: 1.2;

    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }

  &__ruling {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    text-align: left;
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 4px;
    cursor: pointer;

    svg {
      flex: none;
    }
  }

  &__list,
  &__credits {
    display: grid;
    gap: 6px;
    margin: 0;
    padding-left: 20px;
  }

  &__credits {
    padding-left: 0;
    color: $color-muted;
    font-size: 14px;
    list-style: none;
  }

  &__feedback {
    padding-top: 10px;
    border-top: 2px solid $color-sand;
    font-weight: 700;
  }
}
</style>
