<template>
  <header class="main-header">
    <div class="main-header__content">
      <NuxtLink
        v-if="shouldShowLogoLink"
        to="/"
        class="main-header__logo"
        :aria-label="$t('layout.header.a11y.logo-alt')"
      >
        <LogoMinimal class="main-header__logo-icon" aria-hidden="true" />

        <div class="main-header__logo-text" aria-hidden="true">Terra Incognita</div>
      </NuxtLink>

      <div v-else>
        <!-- Placeholder Logo Link -->
      </div>

      <LanguagePicker />
    </div>
  </header>
</template>

<script setup lang="ts">
const shouldShowLogoLink = computed(() => useRoute().path !== '/');
</script>

<style lang="scss">
.main-header {
  border-bottom: 1px solid rgba($colors-blue-dark, 0.5);

  &__content {
    @include container();

    height: 80px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__logo {
    height: 32px;
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: uppercase;
    color: $colors-text-dark;

    &:hover {
      text-decoration: none;
    }

    @include focus-state();
  }

  &__logo-icon {
    height: 100%;
  }

  &__logo-text {
    display: none;

    @include breakpoint(mobile) {
      display: unset;
    }
  }
}
</style>
