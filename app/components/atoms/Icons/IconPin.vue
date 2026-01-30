<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 241 333" :class="['icon-pin', `icon-pin--${color}`]">
    <path d="M119,320c-29.1-36.7-55.2-74.6-78.2-115.6C15.4,159-3.5,102.8,31.3,57.3,63.3,15.5,120.6,0,168.7,23.4c46.2,22.4,70.7,74,60.3,124.1-8.3,40-75.5,136.7-102,172.5-1.2,1.6-2.8,2.2-4,2.2s-2.8-.5-4-2.1h0ZM168.2,115c-.6-26.9-24.1-45.6-48.5-44.9-24.2.7-45.2,20.3-45.1,45.8,0,26.6,21.7,46.2,46.9,46.4,25.2.2,47.4-19.4,46.8-47.2h0Z" />
  </svg>
</template>

<script setup lang="ts">
import type { UIButtonColor } from '@atoms/UIButton/UIButton.types';

withDefaults(defineProps<{ color?: UIButtonColor }>(), {
  color: 'grey'
});
</script>

<style lang="scss">
@mixin theme($name, $color) {
  &--#{$name} {
    fill: $color;
  }
}

.icon-pin {
  @include theme('grey', $colors-grey-dark);
  @include theme('blue', $colors-blue-dark);
  @include theme('orange', $colors-orange-dark);
  @include theme('green', $colors-green-dark);
}
</style>
