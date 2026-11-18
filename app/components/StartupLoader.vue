<script setup lang="ts">
defineProps<{ isMapDrawn: boolean }>();
const emit = defineEmits<{ revealed: [] }>();

const beatMs = 180;

const { start: startBeat } = useTimeoutFn(() => emit('revealed'), beatMs, { immediate: false });
</script>

<template>
  <Transition
    name="startup-loader"
    @after-leave="startBeat"
  >
    <div
      v-if="!isMapDrawn"
      class="startup-loader"
      role="status"
    >
      <p class="startup-loader__title">{{ $t('app.title') }}</p>

      <div
        class="startup-loader__cells"
        aria-hidden="true"
      >
        <span
          v-for="cell in 5"
          :key="cell"
          class="startup-loader__cell"
          :style="{ '--cell-order': cell - 1 }"
        />
      </div>

      <span class="startup-loader__status">{{ $t('loader.status') }}</span>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.startup-loader {
  position: fixed;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 22px;
  background: $color-paper;
  color: $color-ink;

  &__title {
    margin: 0;
    padding: 14px 20px 12px;
    border: 2px solid $color-ink;
    border-radius: 6px;
    background: $color-surface;
    box-shadow: 0 4px 0 $color-ink;
    font-family: $font-serif;
    font-size: 32px;
    font-weight: 900;
    letter-spacing: -0.02em;
  }

  &__cells {
    display: flex;
    gap: 6px;
  }

  &__cell {
    width: 14px;
    height: 14px;
    border: 1.5px solid $color-ink;
    border-radius: 3px;
    background: $color-paper;
    animation: startup-loader-pulse 1500ms ease-in-out infinite;
    animation-delay: calc(var(--cell-order) * 180ms);

    .motion-reduced & {
      animation: none;
    }
  }

  &__status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

.startup-loader-leave-active {
  transition: opacity 420ms ease-out;
}

.startup-loader-leave-to {
  opacity: 0;
}

@keyframes startup-loader-pulse {
  0%, 60%, 100% {
    background: $color-paper;
  }

  20%, 40% {
    background: $color-mustard;
  }
}
</style>
