<script setup lang="ts">
import { useSound } from '~/composables/useSound';
import { letterRowsFor } from '~~/shared/utils/tileKeyboardRows';

type KeyKind = 'letter' | 'hyphen' | 'erase' | 'space' | 'submit';

interface TileKey {
  id: string
  kind: KeyKind
  face: string
  name?: string
}

const props = defineProps<{ submitKey: 'submit' | 'next' }>();
const emit = defineEmits<{ type: [text: string], erase: [], submit: [] }>();

const { locale, t } = useI18n();
const sound = useSound();

const pressedKeyId = ref<string | null>(null);

const letterKeys = (letters: string): TileKey[] => [...letters].map(letter => ({ id: letter, kind: 'letter', face: letter.toUpperCase() }));

const keyRows = computed<TileKey[][]>(() => {
  const [top, middle, bottom] = letterRowsFor(locale.value);
  return [
    letterKeys(top),
    letterKeys(middle),
    [{ id: '-', kind: 'hyphen', face: '-', name: t('typed.keys.hyphen') }, ...letterKeys(bottom), { id: 'erase', kind: 'erase', face: '', name: t('typed.keys.delete') }],
    [{ id: ' ', kind: 'space', face: t('typed.keys.space') }, { id: 'submit', kind: 'submit', face: t(`typed.keys.${props.submitKey}`) }],
  ];
});

const run = (key: TileKey) => {
  if (key.kind === 'submit') emit('submit');
  else if (key.kind === 'erase') emit('erase');
  else emit('type', key.id);
};

const press = (event: PointerEvent, key: TileKey) => {
  if (event.button !== 0) return;
  // Keeps focus and the caret in the answer input.
  event.preventDefault();
  pressedKeyId.value = key.id;
  if (key.kind !== 'submit') sound.tick();
  run(key);
};

const release = () => {
  pressedKeyId.value = null;
};

const activate = (event: MouseEvent, key: TileKey) => {
  // Pointer presses already ran on pointerdown; keyboard and assistive activation reports detail 0.
  if (event.detail === 0) run(key);
};
</script>

<template>
  <div
    class="tile-keyboard"
    :style="{ '--row-keys': keyRows[0]!.length }"
    role="group"
    :aria-label="$t('typed.keyboard')"
  >
    <div
      v-for="(row, rowIndex) in keyRows"
      :key="rowIndex"
      class="tile-keyboard__row"
    >
      <button
        v-for="key in row"
        :key="key.id"
        type="button"
        class="tile-keyboard__key"
        :class="[`tile-keyboard__key--${key.kind}`, { 'tile-keyboard__key--pressed': pressedKeyId === key.id }]"
        :aria-label="key.name"
        @pointerdown="press($event, key)"
        @pointerup="release"
        @pointercancel="release"
        @pointerleave="release"
        @click="activate($event, key)"
      >
        <svg
          v-if="key.kind === 'erase'"
          viewBox="0 0 28 20"
          width="26"
          height="18"
          aria-hidden="true"
        >
          <path
            d="M9 2h16v16H9L2 10z"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linejoin="round"
          />

          <path
            d="M13 7l6 6M19 7l-6 6"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        </svg>

        <template v-else>
          {{ key.face }}
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tile-keyboard {
  --key-gap: 4px;

  display: grid;
  gap: 8px;
}

.tile-keyboard__row {
  display: flex;
  justify-content: center;
  gap: var(--key-gap);
}

.tile-keyboard__key {
  flex: 0 0 calc((100% - (var(--row-keys) - 1) * var(--key-gap)) / var(--row-keys));
  display: grid;
  place-items: center;
  min-width: 0;
  height: clamp(32px, 7dvh, 48px);
  padding: 0;
  border: 1.5px solid $color-ink;
  border-radius: 5px;
  background: $color-surface;
  box-shadow: 0 3px 0 $color-ink;
  font-family: $font-sans;
  font-size: 19px;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;

  &--pressed {
    transform: translateY(2px);
    box-shadow: 0 1px 0 $color-ink;
  }

  &--hyphen,
  &--erase {
    flex: 1 1 0;
    background: $color-sand;
  }

  &--space {
    flex: 2 1 0;
    font-size: 14px;
    letter-spacing: 0.04em;
  }

  &--submit {
    flex: 1 1 0;
    background: $color-green;
    color: $color-surface;
    font-size: 16px;
    font-weight: 800;
  }
}
</style>
