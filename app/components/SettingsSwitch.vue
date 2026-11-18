<script setup lang="ts">
defineProps<{ label: string, hint: string, isOn: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const hintId = useId();
</script>

<template>
  <div class="settings-switch">
    <button
      type="button"
      role="switch"
      class="tile settings-switch__button"
      :aria-checked="isOn"
      :aria-describedby="hintId"
      @click="emit('toggle')"
    >
      <span>{{ label }}</span>

      <span
        class="settings-switch__state"
        :class="{ 'settings-switch__state--on': isOn }"
        aria-hidden="true"
      >{{ isOn ? $t('settings.on') : $t('settings.off') }}</span>
    </button>

    <p
      :id="hintId"
      class="settings-switch__hint"
    >
      {{ hint }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.settings-switch {
  display: grid;
  gap: 8px;

  &__button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 56px;
    padding: 0 16px;
    font-size: 18px;
    font-weight: 700;
  }

  &__state {
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

  &__hint {
    margin: 0;
    color: $color-muted;
    font-size: 14px;
  }
}
</style>
