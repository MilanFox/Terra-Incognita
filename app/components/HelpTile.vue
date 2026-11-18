<script setup lang="ts">
import type { Mode } from '#shared/game/game';

const props = defineProps<{ mode: Mode, isTimed?: boolean }>();

const isOpen = ref(false);
const opener = useTemplateRef<HTMLButtonElement>('opener');
const heading = useTemplateRef<HTMLHeadingElement>('heading');
const closeTile = useTemplateRef<HTMLButtonElement>('closeTile');
const headingId = useId();
const textId = useId();
const clockLineId = useId();

const open = async () => {
  isOpen.value = true;
  await nextTick();
  heading.value?.focus({ preventScroll: true });
};

const close = async () => {
  isOpen.value = false;
  await nextTick();
  opener.value?.focus();
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
  else if (event.key === 'Tab') {
    event.preventDefault();
    closeTile.value?.focus();
  }
};
</script>

<template>
  <button
    ref="opener"
    v-bind="$attrs"
    type="button"
    class="tile help-tile"
    :aria-label="$t('help.open')"
    aria-haspopup="dialog"
    @click="open"
  >
    <span aria-hidden="true">?</span>
  </button>

  <Teleport to="body">
    <div
      v-if="isOpen"
      class="help-scrim"
    >
      <div
        class="tile help-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="headingId"
        :aria-describedby="props.isTimed ? `${textId} ${clockLineId}` : textId"
        @keydown="handleKeydown"
      >
        <h2
          :id="headingId"
          ref="heading"
          class="help-dialog__title"
          tabindex="-1"
        >
          {{ $t('help.title', { mode: $t(`modes.${props.mode}.name`) }) }}
        </h2>

        <p
          :id="textId"
          class="help-dialog__text"
        >
          {{ $t(`modes.${props.mode}.help`) }}
        </p>

        <p
          v-if="props.isTimed"
          :id="clockLineId"
          class="help-dialog__text"
        >
          {{ $t('help.clockRuns') }}
        </p>

        <button
          ref="closeTile"
          type="button"
          class="tile help-dialog__close"
          @click="close"
        >
          {{ $t('help.close') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.help-tile {
  display: grid;
  place-items: center;
  width: 40px;
  min-height: 40px;
  padding: 0;
  pointer-events: auto;
  font-family: $font-serif;
  font-size: 20px;
  font-weight: 900;
}

.help-scrim {
  position: fixed;
  z-index: 10;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgb(20 20 20 / 45%);
}

.help-dialog {
  display: grid;
  gap: 12px;
  width: min(100%, 420px);
  max-height: 100%;
  padding: 18px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: $color-paper;

  &__title {
    margin: 0;
    font-family: $font-serif;
    font-size: 24px;
    font-weight: 900;
    line-height: 1.05;
  }

  &__text {
    margin: 0;
    font-size: 16px;
    line-height: 1.4;
  }

  &__close {
    justify-self: end;
    min-height: 44px;
    padding: 0 20px;
    font-family: $font-serif;
    font-size: 18px;
    font-weight: 800;
  }
}
</style>
