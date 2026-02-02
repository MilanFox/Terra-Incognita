<template>
  <div class="home">
    <Hero class="home__hero" />

    <div class="home__content">
      <ContentSection :title="$t('sections.playAQuiz')">
        <div class="home__cards">
          <Card
            :img="blueIsland"
            color="blue"
            title="Lorem ipsum dolor sit amet"
            description="Lorem Ipsum is simply dummy text of the printing and typesetting industry."
            :link="{ text: 'Placeholder Link', to: '/' }"
          />

          <Card
            :img="orangeMap"
            color="orange"
            title="Lorem ipsum dolor sit amet"
            description="Lorem Ipsum is simply dummy text of the printing and typesetting industry."
            :link="{ text: 'Placeholder Link', to: '/' }"
          />

          <Card
            :img="greenHills"
            color="green"
            title="Lorem ipsum dolor sit amet"
            description="Lorem Ipsum is simply dummy text of the printing and typesetting industry."
            :link="{ text: 'Placeholder Link', to: '/' }"
          />
        </div>
      </ContentSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import blueIsland from '@assets/images/cards/blue-island.webp';
import orangeMap from '@assets/images/cards/orange-map.webp';
import greenHills from '@assets/images/cards/green-hills.webp';
</script>

<style lang="scss">
.home {
  &__content > * {
    margin-top: 32px;
  }

  &__cards {
    display: grid;
    gap: 32px;

    @include breakpoint(tablet) {
      grid-template-columns: 1fr 1fr 1fr;
    }
  }
}
</style>
