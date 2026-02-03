<template>
  <div class="page-title">
    <IconPin class="page-title__icon" :color="color" />

    <h1 class="page-title__title">
      {{ title }}
    </h1>
  </div>
</template>

<script setup lang="ts">
import type { PageTitleProps } from './PageTitle.types';

defineProps<PageTitleProps>();
</script>

<style lang="scss">
.page-title {
  @include container();
  display: flex;
  gap: 16px;
  align-items: center;

  &__icon {
    height: 30px;
  }

  &__title {
    margin-block: 0;
  }
}
</style>
