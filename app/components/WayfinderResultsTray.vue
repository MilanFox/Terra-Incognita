<script setup lang="ts">
import type { GameState } from '#shared/game/game';
import { useSound } from '~/composables/useSound';

defineProps<{ state: Extract<GameState, { phase: 'wayfinderResults' }> }>();
const emit = defineEmits<{ playAgain: [], changeSetup: [], leave: [] }>();

const sound = useSound();

const titleId = useId();
const tray = useTemplateRef<HTMLElement>('tray');
const title = useTemplateRef<HTMLHeadingElement>('title');

const focusableTiles = () => [...tray.value!.querySelectorAll<HTMLElement>('button')];

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('leave');
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

onMounted(() => {
  title.value?.focus({ preventScroll: true });
  sound.results();
});

defineExpose({ element: tray });
</script>

<template>
  <section
    ref="tray"
    class="tray wayfinder-results-tray"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    @keydown="handleKeydown"
  >
    <h2
      :id="titleId"
      ref="title"
      class="wayfinder-results-tray__title"
      tabindex="-1"
    >
      {{ state.isComplete ? $t('results.title') : $t('results.titleEnded') }}
    </h2>

    <div class="wayfinder-results-tray__actions">
      <button
        type="button"
        class="tile wayfinder-results-tray__play-again"
        @click="emit('playAgain')"
      >
        {{ $t('results.playAgain') }}
      </button>

      <button
        type="button"
        class="tile wayfinder-results-tray__secondary"
        @click="emit('changeSetup')"
      >
        {{ $t('results.changeSetup') }}
      </button>

      <button
        type="button"
        class="tile wayfinder-results-tray__secondary"
        @click="emit('leave')"
      >
        {{ $t('results.home') }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.wayfinder-results-tray {
  display: grid;
  gap: 14px;
  max-width: 520px;
  max-height: calc(100% - env(safe-area-inset-top, 0px) - 72px);
  margin-inline: auto;
  overflow: hidden auto;
  overscroll-behavior: contain;

  &__title {
    margin: 0;
    overflow-wrap: anywhere;
    font-family: $font-serif;
    font-size: 32px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.01em;
  }

  &__actions {
    display: grid;
    gap: 8px;
  }

  &__play-again,
  &__secondary {
    min-height: 52px;
    font-family: $font-serif;
    font-size: 20px;
    font-weight: 800;
  }

  &__play-again {
    background: $color-green;
    color: $color-surface;
  }
}
</style>
