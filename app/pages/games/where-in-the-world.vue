<template>
  <div class="where-in-the-world-page">
    <PageTitle color="blue" />

    <div class="where-in-the-world-page__game">
      <WhereInTheWorld />
    </div>
  </div>
</template>

<style lang="scss">
.where-in-the-world-page {
  &__game {
    @include container();
  }

  > * + * {
    margin-top: 32px;
  }
}
</style>
