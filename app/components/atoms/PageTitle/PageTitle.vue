<template>
  <div class="page-title">
    <Breadcrumbs class="page-title__breadcrumbs" />

    <div class="page-title__heading">
      <IconPin class="page-title__icon" :color="color" />

      <h1 class="page-title__title">
        {{ $t(`routeNames.${name}`) }}
      </h1>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PageTitleProps } from './PageTitle.types';

defineProps<PageTitleProps>();

const { path } = useRoute();
const name = path.split('/').at(-1);
</script>

<style lang="scss">
.page-title {
  @include container();

  &__heading {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  &__icon {
    height: 30px;
  }

  &__title {
    margin-block: 0;
  }
}
</style>
