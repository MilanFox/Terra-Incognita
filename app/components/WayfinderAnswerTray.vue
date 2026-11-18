<script setup lang="ts">
import type { GameState } from '#shared/game/game';
import { useGameStore } from '~/stores/game';

const props = defineProps<{ state: Extract<GameState, { phase: 'wayfinder' }> }>();
const emit = defineEmits<{ next: [] }>();

const game = useGameStore();

const inputId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const input = useTemplateRef<HTMLInputElement>('input');
const typedText = ref('');
const isRejected = ref(false);

const isRouteOpen = computed(() => props.state.route.outcome === 'open');
const rejectionCount = computed(() => props.state.rejectedEntries.length);

const replaceSelection = (text: string, start: number, end: number) => {
  input.value!.setRangeText(text, start, end, 'end');
  typedText.value = input.value!.value;
  isRejected.value = false;
};

const type = (text: string) => {
  const field = input.value;
  if (!isRouteOpen.value || !field) return;
  replaceSelection(text, field.selectionStart ?? field.value.length, field.selectionEnd ?? field.value.length);
};

const erase = () => {
  const field = input.value;
  if (!isRouteOpen.value || !field) return;
  const end = field.selectionEnd ?? field.value.length;
  const start = field.selectionStart ?? end;
  replaceSelection('', start === end ? Math.max(0, start - 1) : start, end);
};

const submit = () => {
  if (isRouteOpen.value) game.send({ type: 'submit', text: typedText.value });
  else emit('next');
};

watch([() => props.state.routeNumber, () => props.state.route.entries.length], () => {
  typedText.value = '';
  isRejected.value = false;
});

watch(rejectionCount, async (count) => {
  if (count === 0) return;
  const { reason } = props.state.rejectedEntries.at(-1)!;
  // A place that was understood but not taken is cleared; unclear input stays for editing.
  if (reason !== 'ambiguous' && reason !== 'none') typedText.value = '';
  isRejected.value = false;
  await nextTick();
  requestAnimationFrame(() => isRejected.value = true);
});

useEventListener(document, 'keydown', (event) => {
  const { target } = event;
  if (!isRouteOpen.value || event.ctrlKey || event.metaKey || event.altKey || !/^[\p{L}-]$/u.test(event.key)) return;
  if (target === input.value || (target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"], input, textarea'))) return;
  input.value?.focus({ preventScroll: true });
});

defineExpose({
  element: tray,
  focus: () => input.value?.focus({ preventScroll: true }),
});
</script>

<template>
  <div
    ref="tray"
    class="tray wayfinder-answer-tray"
    :class="{ 'wayfinder-answer-tray--halted': state.isConfirmingEnd }"
    :inert="state.isConfirmingEnd"
  >
    <form
      class="tile wayfinder-answer"
      :class="{ 'wayfinder-answer--rejected': isRejected }"
      @submit.prevent="submit"
    >
      <label
        :for="inputId"
        class="kicker wayfinder-answer__label"
      >{{ $t('typed.answer') }}</label>

      <input
        :id="inputId"
        ref="input"
        v-model="typedText"
        class="wayfinder-answer__input"
        type="text"
        inputmode="none"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        :readonly="!isRouteOpen"
        @input="isRejected = false"
      />
    </form>

    <TileKeyboard
      :submit-key="isRouteOpen ? 'submit' : 'next'"
      @type="type"
      @erase="erase"
      @submit="submit"
    />
  </div>
</template>

<style scoped lang="scss">
.wayfinder-answer-tray {
  display: grid;
  gap: 10px;
  max-width: 520px;
  margin-inline: auto;
  padding: 10px calc(env(safe-area-inset-right, 0px) + 5px) calc(env(safe-area-inset-bottom, 0px) + 8px) calc(env(safe-area-inset-left, 0px) + 5px);
  transition: opacity 150ms ease-out;

  &--halted {
    opacity: 0.45;
  }
}

.wayfinder-answer {
  display: grid;
  gap: 2px;
  margin-inline: 5px;
  padding: 6px 12px 8px;

  &:has(.wayfinder-answer__input:focus-visible) {
    outline: 2px solid $color-ink;
    outline-offset: 2px;
  }

  &--rejected {
    border-color: $color-brick;
    box-shadow: 0 4px 0 $color-brick;
    animation: shake 340ms ease-out;
  }

  &__label {
    color: $color-muted;
  }

  &__input {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: $color-ink;
    font-family: $font-serif;
    font-size: 26px;
    font-weight: 900;
    line-height: 1.2;
    text-transform: capitalize;
    caret-color: $color-ink;

    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  18% { transform: translateX(-9px); }
  36% { transform: translateX(8px); }
  54% { transform: translateX(-6px); }
  72% { transform: translateX(4px); }
  88% { transform: translateX(-2px); }
}

@media (prefers-reduced-motion: reduce) {
  .wayfinder-answer--rejected {
    animation: none;
  }
}
</style>
