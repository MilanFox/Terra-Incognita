<script setup lang="ts">
import { useStartupRevealed } from '~/composables/useStartupRevealed';

const { t, locale } = useI18n();
const isStartupRevealed = useStartupRevealed();

useHead({
  htmlAttrs: { lang: locale },
  title: () => t('app.title'),
});
</script>

<template>
  <NuxtPwaManifest />

  <NuxtPage />

  <UpdateToast v-if="isStartupRevealed" />
</template>
