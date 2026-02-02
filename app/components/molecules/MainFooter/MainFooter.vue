<script setup lang="ts">
</script>

<template>
  <footer class="main-footer">
    <div class="main-footer__content">
      Lorem Ipsum
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
    align-items: center;
    justify-content: space-between;
  }
}
</style>
