<template>
  <div class="default-layout">
    <MainHeader />

    <main>
      <NuxtPage />
    </main>

    <MainFooter />
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

<style>
.default-layout {
  display: grid;
  gap: 32px;
  grid-template-rows: min-content 1fr min-content;
}
</style>
