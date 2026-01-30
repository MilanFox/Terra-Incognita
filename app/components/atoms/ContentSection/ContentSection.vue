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
      background: linear-gradient(to right, transparent, rgba(0, 0, 0, 0.15));
    }

    &::after {
      background: linear-gradient(to left, transparent, rgba(0, 0, 0, 0.15));
    }
  }
}
</style>
