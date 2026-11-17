import { useSettingsStore } from '~/stores/settings';

export default defineNuxtPlugin(async ({ $i18n }) => {
  const settings = useSettingsStore();
  settings.load();
  await $i18n.setLocale(settings.language);
  watch(() => settings.language, language => $i18n.setLocale(language));
});
