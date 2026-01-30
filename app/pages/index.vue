<template>
  <div class="home">
    <Hero class="home__hero" />

    <div class="home__content">
      <div class="home__cards">
        <Card
          color="blue"
          title="Lorem ipsum dolor sit amet"
          description="Lorem Ipsum is simply dummy text of the printing and typesetting industry."
          :link="{ text: 'Placeholder Link', to: '/' }"
        />

        <Card color="orange" />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.home {
  &__content {
    @include container();

    > * {
      margin-top: 32px;
    }
  }

  &__cards {
    display: grid;
    gap: 32px;

    @include breakpoint(tablet) {
      grid-template-columns: 1fr 1fr;
    }
  }
}
</style>
