<script setup lang="ts">
</script>

<template>
  <footer class="main-footer">
    <div class="main-footer__content">
      <NuxtLink to="/transparency/labels"> {{ $t('routeNames.labels') }}</NuxtLink>

      <NuxtLink to="https://github.com/MilanFox/Terra-Incognita"> Source</NuxtLink>
    </div>
  </footer>
</template>

<style lang="scss">
.main-footer {
  border-top: 1px solid rgba($colors-blue-dark, 0.5);

  &__content {
    @include container();

    height: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    justify-content: flex-end;
    padding-block: 8px;

    @include breakpoint(mobile) {
      flex-direction: row;
    }
  }
}
</style>
