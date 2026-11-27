<script setup lang="ts">
import { cellsMaxDeckSize } from '#shared/game/results-report';
import type { DeckEntry, ReportOutcome } from '#shared/game/results-report';

// eslint-disable-next-line no-unused-vars
type EntryLabelOf = (entry: DeckEntry) => string;

const props = defineProps<{ deck: DeckEntry[], selectedPlaceId: string | null, label: string, entryLabelOf: EntryLabelOf }>();
const emit = defineEmits<{ pick: [placeId: string] }>();

const cellMarks: Record<ReportOutcome, string> = { right: '✓', wrong: '✗', missed: '–', unreached: '–' };
const keySteps: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -Infinity, End: Infinity };

const listId = useId();
const activeIndex = ref(0);
const isCells = computed(() => props.deck.length <= cellsMaxDeckSize);

const entryId = (index: number) => `${listId}-${index}`;

const pick = (index: number) => {
  const entry = props.deck[index];
  if (!entry) return;
  activeIndex.value = index;
  emit('pick', entry.placeId);
};

const handleKeydown = (event: KeyboardEvent) => {
  const step = keySteps[event.key];
  if (step !== undefined) activeIndex.value = Math.min(props.deck.length - 1, Math.max(0, activeIndex.value + step));
  else if (event.key === 'Enter' || event.key === ' ') pick(activeIndex.value);
  else return;
  event.preventDefault();
};
</script>

<template>
  <div
    class="outcome-order"
    :class="isCells ? 'outcome-order--cells' : 'outcome-order--barcode'"
    role="listbox"
    tabindex="0"
    :aria-label="label"
    :aria-activedescendant="entryId(activeIndex)"
    @keydown="handleKeydown"
  >
    <span
      v-for="(entry, index) in deck"
      :id="entryId(index)"
      :key="entry.placeId"
      class="outcome-order__entry"
      :class="[`outcome-order__entry--${entry.outcome}`, { 'outcome-order__entry--active': index === activeIndex, 'outcome-order__entry--selected': entry.placeId === selectedPlaceId }]"
      role="option"
      :aria-selected="entry.placeId === selectedPlaceId"
      :aria-label="entryLabelOf(entry)"
      @click="pick(index)"
    >
      <span
        v-if="isCells"
        aria-hidden="true"
      >{{ cellMarks[entry.outcome] }}</span>
    </span>
  </div>
</template>

<style scoped lang="scss">
.outcome-order {
  display: flex;
  border-radius: 4px;
  cursor: pointer;
  touch-action: manipulation;

  &__entry {
    position: relative;
    color: $color-surface;

    &--right {
      background: $color-green;
    }

    &--wrong {
      background: $color-brick;
    }

    &--missed {
      background: $color-sand;
      color: $color-ink;
    }

    &--unreached {
      background: $color-paper;
      color: $color-ink;
    }
  }

  &--barcode {
    height: 32px;
    overflow: hidden;
    border: 2px solid $color-ink;
  }

  &--barcode &__entry {
    flex: 1 1 0;
    min-width: 0;
  }

  &--barcode &__entry--selected::after,
  &--barcode:focus-visible &__entry--active::after {
    content: '';
    position: absolute;
    z-index: 1;
    inset: 0 -3px;
    border-inline: 2px solid $color-ink;
    background: $color-mustard;
  }

  &--barcode:focus-visible &__entry--active::after {
    z-index: 2;
    background: $color-surface;
  }

  &--cells {
    flex-wrap: wrap;
    gap: 5px;
  }

  &--cells &__entry {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 2px solid $color-ink;
    border-radius: 4px;
    font-size: 16px;
    font-weight: 800;
  }

  &--cells &__entry--selected {
    box-shadow: 0 0 0 2px $color-paper, 0 0 0 4px $color-mustard, 0 0 0 5.5px $color-ink;
  }

  &--cells:focus-visible {
    outline-offset: 6px;
  }

  &--cells:focus-visible &__entry--active {
    outline: 2px solid $color-ink;
    outline-offset: 2px;
  }
}
</style>
