<template>
  <button
    v-if="type === 'button'"
    type="button"
    :class="['ui-button', `ui-button--${color}`]"
    v-bind="$attrs"
  >
    <slot />
  </button>

  <NuxtLink
    v-if="type === 'link'"
    :to="to"
    :class="['ui-button', 'ui-button--link', `ui-button--${color}`]"
    v-bind="$attrs"
  >
    <slot />
  </NuxtLink>
</template>

<script setup lang="ts">
import type { UIButtonProps } from './UIButton.types';

withDefaults(defineProps<UIButtonProps>(), {
  color: 'grey',
  type: 'button',
});
</script>

<style lang="scss">
@mixin theme($name, $light, $dark, $text) {
  &--#{$name} {
    color: $text;
    background: $light;
    border: 1px solid $dark;
    box-shadow: 0 2px 2px $dark;
  }
}

.ui-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  border-radius: 999px;
  border: none;
  padding: 12px 40px;

  font-family: inherit;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.05em;
  text-decoration: none;

  transition: transform 0.1s ease, box-shadow 0.1s ease;

  &:active {
    transform: translateY(1px);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1)
  }

  &--link::after {
    content: '›' / ''
  }

  @include theme('grey', $colors-grey-light, $colors-grey-dark, $colors-text-dark);
  @include theme('green', $colors-green-light, $colors-green-dark, $colors-text-light);
  @include theme('blue', $colors-blue-light, $colors-blue-dark, $colors-text-light);
  @include theme('orange', $colors-orange-light, $colors-orange-dark, $colors-text-light);

  @include focus-state();

  @include breakpoint(tablet) {
    font-size: 18px;
  }
}
</style>
