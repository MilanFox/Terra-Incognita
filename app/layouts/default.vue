<template>
  <NuxtPage />
</template>

<script setup lang="ts">
import { useLocaleHead } from '#i18n';

const i18nHead = useLocaleHead({ lang: true, dir: true, seo: true });

useHead(() => ({
  htmlAttrs: i18nHead.value.htmlAttrs,
  meta: i18nHead.value.meta,
  link: i18nHead.value.link,
}));
</script>
