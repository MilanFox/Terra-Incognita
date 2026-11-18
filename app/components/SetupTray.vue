<script setup lang="ts">
import type { DeckSize, Mode, RegionChoice, RoundSetup, Tier, Variant } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ setup: RoundSetup }>();
const emit = defineEmits<{ 'update:setup': [setup: RoundSetup], 'play': [], 'close': [] }>();

const { t } = useI18n();
const game = useGameStore();

const titleId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const title = useTemplateRef<HTMLHeadingElement>('title');

const choices = computed(() => game.choicesFor(props.setup));

const countText = (count: number) => t('setup.places', { count }, count);

const accessibleName = (name: string, count: number, isAvailable: boolean) =>
  t(isAvailable ? 'setup.optionName' : 'setup.unavailableOptionName', { name, places: countText(count) });

const variantOptions = computed(() => choices.value.variants.map(({ value, count, isAvailable }) => {
  const label = t(`setup.variants.${value}`);
  return { value, label, detail: String(count), accessibleName: accessibleName(label, count, isAvailable), isAvailable };
}));

const regionOptions = computed(() => choices.value.regions.map(({ value, count, isAvailable }) => {
  const label = t(`setup.regions.${value}`);
  return { value, label, detail: String(count), accessibleName: accessibleName(label, count, isAvailable), isAvailable };
}));

const tierOptions = computed(() => choices.value.tiers.map(({ value, count, isAvailable }) => {
  const label = t(`setup.tiers.${value}`);
  return { value, label, detail: String(count), accessibleName: accessibleName(label, count, isAvailable), isAvailable };
}));

const deckSizeOptions = computed(() => choices.value.deckSizes.map(({ value, count, isAvailable }) => {
  const label = t(`setup.deckSizes.${value}`);
  return { value, label, accessibleName: accessibleName(label, count, isAvailable), isAvailable };
}));

const change = (changes: Partial<RoundSetup>) => emit('update:setup', { ...props.setup, ...changes });

const focusableTiles = () => [...tray.value!.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])')];

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') return;
  const tiles = focusableTiles();
  const first = tiles[0]!;
  const last = tiles.at(-1)!;
  const active = document.activeElement;
  const isLeaving = event.shiftKey ? active === first || active === title.value : active === last;
  if (!tray.value!.contains(active) || isLeaving) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
};

onMounted(() => title.value?.focus({ preventScroll: true }));

defineExpose({ element: tray });
</script>

<template>
  <section
    ref="tray"
    class="tray setup-tray"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    @keydown="handleKeydown"
  >
    <header class="setup-tray__header">
      <h2
        :id="titleId"
        ref="title"
        class="setup-tray__title"
        tabindex="-1"
      >
        {{ $t(`modes.${setup.mode as Mode}.name`) }}
      </h2>

      <div class="setup-tray__actions">
        <HelpTile :mode="setup.mode" />

        <button
          type="button"
          class="tile setup-tray__close"
          :aria-label="$t('setup.close')"
          @click="emit('close')"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
          >
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="square"
            />
          </svg>
        </button>
      </div>
    </header>

    <div class="setup-tray__rows">
      <RadioTiles
        v-if="variantOptions.length > 1"
        :label="$t('setup.groups.variant')"
        :options="variantOptions"
        :model-value="setup.variant"
        @update:model-value="change({ variant: $event as Variant })"
      />

      <RadioTiles
        v-if="setup.mode !== 'missing'"
        :label="$t('setup.groups.region')"
        :options="regionOptions"
        :model-value="setup.region"
        @update:model-value="change({ region: $event as RegionChoice })"
      />

      <RadioTiles
        :label="$t('setup.groups.tier')"
        :options="tierOptions"
        :model-value="setup.tier"
        @update:model-value="change({ tier: $event as Tier })"
      />

      <RadioTiles
        v-if="setup.mode !== 'missing'"
        :label="$t('setup.groups.deckSize')"
        :options="deckSizeOptions"
        :model-value="setup.deckSize"
        @update:model-value="change({ deckSize: $event as DeckSize })"
      />

      <button
        type="button"
        role="switch"
        class="tile setup-tray__switch"
        :aria-checked="setup.timed"
        @click="change({ timed: !setup.timed })"
      >
        <span>{{ $t('setup.timed') }}</span>

        <span
          class="setup-tray__switch-state"
          :class="{ 'setup-tray__switch-state--on': setup.timed }"
          aria-hidden="true"
        >{{ setup.timed ? $t('setup.on') : $t('setup.off') }}</span>
      </button>

      <button
        type="button"
        role="switch"
        class="tile setup-tray__switch"
        :aria-checked="setup.easy"
        @click="change({ easy: !setup.easy })"
      >
        <span>{{ $t('setup.easy') }}</span>

        <span
          class="setup-tray__switch-state"
          :class="{ 'setup-tray__switch-state--on': setup.easy }"
          aria-hidden="true"
        >{{ setup.easy ? $t('setup.on') : $t('setup.off') }}</span>
      </button>
    </div>

    <div class="setup-tray__play">
      <button
        type="button"
        class="tile setup-tray__play-tile"
        @click="emit('play')"
      >
        {{ $t('setup.play', { count: choices.playCount }, choices.playCount) }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.setup-tray {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 520px;
  max-height: calc(100% - env(safe-area-inset-top, 0px) - 72px);
  margin-inline: auto;
  padding-bottom: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-padding-bottom: 88px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  &__title {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    font-family: $font-serif;
    font-size: 26px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.01em;
  }

  &__actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
  }

  &__close {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
  }

  &__rows {
    display: grid;
    gap: 12px;
  }

  &__switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 52px;
    padding: 0 16px;
    font-size: 18px;
    font-weight: 700;
  }

  &__switch-state {
    min-width: 52px;
    padding: 4px 10px;
    border: 2px solid $color-ink;
    border-radius: 4px;
    background: $color-sand;
    font-size: 14px;
    text-align: center;

    &--on {
      background: $color-green;
      color: $color-paper;
    }
  }

  &__play {
    position: sticky;
    bottom: 0;
    margin-inline: -18px;
    padding: 10px 18px calc(env(safe-area-inset-bottom, 0px) + 16px);
    background: $color-paper;
  }

  &__play-tile {
    width: 100%;
    min-height: 52px;
    background: $color-green;
    color: $color-surface;
    font-family: $font-serif;
    font-size: 20px;
    font-weight: 800;
  }
}
</style>
