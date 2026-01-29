<template>
  <div class="default-layout">
    <MainHeader />

    <main>
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useLocaleHead } from '#i18n';
import MainHeader from '@molecules/MainHeader/MainHeader.vue';

const i18nHead = useLocaleHead({ lang: true, dir: true, seo: true });

useHead(() => ({
  htmlAttrs: i18nHead.value.htmlAttrs,
  meta: i18nHead.value.meta,
  link: i18nHead.value.link,
}));
</script>

<style lang="scss">
.default-layout {
  @include container();
}
</style>
