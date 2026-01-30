<template>
  <section class="content-section">
    <h2 class="content-section__title">{{ title }}</h2>

    <slot />
  </section>
</template>

<script setup lang="ts">
import type { ContentSectionProps } from './ContentSection.types';

defineProps<ContentSectionProps>();
</script>

<style lang="scss">
.content-section {
  margin-top: 0;

  @include container();

  &__title {
    display: flex;
    align-items: center;
    text-align: center;
    gap: 1rem;

    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 2px;
    }

    &::before {
      background: linear-gradient(to right, transparent, rgba($colors-blue-dark, 0.5));
    }

    &::after {
      background: linear-gradient(to left, transparent, rgba($colors-blue-dark, 0.5));
    }
  }
}
</style>
