import { useSettingsStore } from '~/stores/settings';

export const useReducedMotion = () => {
  const settings = useSettingsStore();
  return computed(() => settings.isMotionReduced);
};
