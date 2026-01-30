<script setup lang="ts">
</script>

<template>
  <div class="hero">
    <LogoFull class="hero__logo" aria-hidden="true" />

    <div class="hero__content">
      <h1 class="hero__title headline--level-1">{{ $t('hero.title') }}</h1>

      <p class="hero__subtitle headline--level-2">{{ $t('hero.subtitle') }}</p>

      <div class="hero__links">
        <UIButton type="link" class="hero__link" color="blue" to="/">Placeholder 1</UIButton>

        <UIButton type="link" class="hero__link" to="/">Placeholder 2</UIButton>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.hero {
  background-image: url('@assets/images/hero-bg.png');
  background-repeat: no-repeat;
  background-size: cover;
  background-position: 50% 50%;
  text-align: center;
  padding: 16px 16px 80px;

  &__logo {
    display: block;
    height: 80px;
    margin: 0 auto;
    filter: drop-shadow(4px 0 0 #fff) drop-shadow(-4px 0 0 #fff) drop-shadow(0 4px 0 #fff) drop-shadow(0 -4px 0 #fff) drop-shadow(4px 4px 0 #fff) drop-shadow(-4px 4px 0 #fff) drop-shadow(4px -4px 0 #fff) drop-shadow(-4px -4px 0 #fff);
    transform: translateY(-80px);

    @include breakpoint(mobile) {
      height: 160px;
      transform: translateY(-100px);
    }
  }

  &__content {
    filter: drop-shadow(0 0 30px white) drop-shadow(0 0 30px white)
  }

  &__title {
    margin: -50px 0 8px;

    @include breakpoint(mobile) {
      margin: -80px 0 8px;
    }
  }

  &__subtitle {
    margin: 8px 0 32px;
  }

  &__links {
    display: flex;
    flex-direction: column;
    gap: 32px;
    justify-content: center;
    align-items: center;

    @include breakpoint(tablet) {
      flex-direction: row;
    }
  }

  &__link {
    width: 300px;
  }
}
</style>
