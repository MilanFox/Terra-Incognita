<script setup lang="ts">
const { t, locale } = useI18n();

useHead({
  htmlAttrs: { lang: locale },
  title: () => t('app.title'),
});
</script>

<template>
  <NuxtPwaManifest />

  <NuxtPage />

  <UpdateToast />
</template>
