import { useSettingsStore } from '~/stores/settings';

export default defineNuxtPlugin(async ({ $i18n }) => {
  const settings = useSettingsStore();
  settings.load();
  watchEffect(() => document.documentElement.classList.toggle('motion-reduced', settings.isMotionReduced));
  await $i18n.setLocale(settings.language);
  watch(() => settings.language, language => $i18n.setLocale(language));
});
