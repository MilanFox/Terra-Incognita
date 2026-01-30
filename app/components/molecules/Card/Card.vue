<template>
  <div :class="['card', `card--${color}`]" :style="`--offset: ${offsetX}% ${offsetY}%`">
    <img :src="img" class="card__preview" alt="" />

    <slot class="title">
      <h3 class="card__title">{{ title }}</h3>
    </slot>

    <slot name="description">
      <p class="card__description">{{ description }}</p>
    </slot>

    <slot name="cta">
      <UIButton v-if="link" type="link" :to="link.to" :color="color" class="card__cta">
        {{ link.text }}
      </UIButton>
    </slot>
  </div>
</template>

<script setup lang="ts">
import type { CardProps } from '@molecules/Card/Card.types';

const props = withDefaults(defineProps<CardProps>(), {
  color: 'grey',
});

const getOffsetFromColor = (color: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < color.length; i++) {
    h ^= color.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const x = (h >>> 16) % 101;
  const y = (h & 0xffff) % 101;
  return [x, y];
};

const [offsetX, offsetY] = getOffsetFromColor(props.color);
</script>

<style lang="scss">
@mixin theme($name, $color-bg, $color-light, $color-dark) {
  &--#{$name} {
    background-image: linear-gradient(190deg, white 25%, transparent 75%), url($topology-map), linear-gradient(150deg, white 50%, $color-bg 85%);
    filter: drop-shadow(0 4px 0 rgba($color-light, 0.75));
    border: 1px solid $color-dark;
  }
}

.card {
  background-position: var(--offset);
  border-radius: 16px;
  padding: 16px;

  &__preview {
    height: 200px;
    width: 100%;
    border-radius: 16px;
    object-fit: cover;
  }

  &__title {
    font-size: 24px;
    margin-block: 8px;
  }

  &__description {
    font-size: 16px;
    font-weight: 300;
  }

  &__cta {
    margin-top: 16px;
    width: 100%;
  }

  @include theme('grey', $colors-grey-bg, $colors-grey-light, $colors-grey-light);
  @include theme('blue', $colors-blue-bg, $colors-blue-light, $colors-blue-dark);
  @include theme('orange', $colors-orange-bg, $colors-orange-light, $colors-orange-light);
  @include theme('green', $colors-green-bg, $colors-green-light, $colors-green-light);
}
</style>
