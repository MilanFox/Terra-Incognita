<script setup lang="ts">
import { pausesPerRound } from '#shared/game/game';

defineProps<{ pausesLeft: number }>();
const emit = defineEmits<{ resume: [] }>();

const resumeTile = useTemplateRef<HTMLButtonElement>('resumeTile');
const titleId = useId();
const pausesLeftId = useId();

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('resume');
  }
  else if (event.key === 'Tab') {
    event.preventDefault();
    resumeTile.value?.focus();
  }
};

onMounted(() => resumeTile.value?.focus());
</script>

<template>
  <Teleport to="body">
    <div class="pause-screen">
      <div
        class="tile pause-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${titleId} ${pausesLeftId}`"
        @keydown="handleKeydown"
      >
        <h2
          :id="titleId"
          class="pause-dialog__title"
        >
          {{ $t('pause.title') }}
        </h2>

        <p
          :id="pausesLeftId"
          class="pause-dialog__left"
        >
          {{ $t('pause.left', { count: pausesLeft, total: pausesPerRound }) }}
        </p>

        <button
          ref="resumeTile"
          type="button"
          class="tile pause-dialog__resume"
          @click="emit('resume')"
        >
          {{ $t('pause.resume') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.pause-screen {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: $color-paper;
}

.pause-dialog {
  display: grid;
  gap: 8px;
  width: min(100%, 420px);
  max-height: 100%;
  padding: 18px;
  overflow-y: auto;
  overscroll-behavior: contain;

  &__title {
    margin: 0;
    font-family: $font-serif;
    font-size: 32px;
    font-weight: 900;
    line-height: 1.02;
  }

  &__left {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  &__resume {
    min-height: 52px;
    margin-top: 10px;
    background: $color-green;
    color: $color-surface;
    font-family: $font-serif;
    font-size: 20px;
    font-weight: 800;
  }
}
</style>
