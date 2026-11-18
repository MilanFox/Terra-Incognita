import { defineStore } from 'pinia';

export type Language = 'en' | 'de';

export type MotionChoice = 'system' | 'on' | 'off';

const storageKey = 'ti:settings';
const languages: Language[] = ['en', 'de'];
export const motionChoices: MotionChoice[] = ['system', 'on', 'off'];

const readStored = (): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  }
  catch {
    return null;
  }
};

const detectBrowserLanguage = (): Language =>
  navigator.languages
    .map(tag => tag.slice(0, 2).toLowerCase())
    .find((code): code is Language => languages.includes(code as Language)) ?? 'en';

export const useSettingsStore = defineStore('settings', () => {
  const isSoundOn = ref(true);
  const language = ref<Language>('en');
  const reduceMotion = ref<MotionChoice>('system');
  const isHighContrast = ref(false);
  const isWaitForNextOn = ref(false);
  const isSystemKeyboardOn = ref(false);
  const systemMotion = usePreferredReducedMotion();
  const isMotionReduced = computed(() => reduceMotion.value === 'on' || (reduceMotion.value === 'system' && systemMotion.value === 'reduce'));

  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify({
      ...readStored(),
      sound: isSoundOn.value,
      language: language.value,
      reduceMotion: reduceMotion.value,
      highContrast: isHighContrast.value,
      waitForNext: isWaitForNextOn.value,
      systemKeyboard: isSystemKeyboardOn.value,
    }));
  };

  const load = () => {
    const stored = readStored();
    if (!stored) {
      language.value = detectBrowserLanguage();
      save();
      navigator.storage?.persist?.().catch(() => undefined);
      return;
    }
    if (typeof stored.sound === 'boolean') isSoundOn.value = stored.sound;
    if (languages.includes(stored.language as Language)) language.value = stored.language as Language;
    if (motionChoices.includes(stored.reduceMotion as MotionChoice)) reduceMotion.value = stored.reduceMotion as MotionChoice;
    if (typeof stored.highContrast === 'boolean') isHighContrast.value = stored.highContrast;
    if (typeof stored.waitForNext === 'boolean') isWaitForNextOn.value = stored.waitForNext;
    if (typeof stored.systemKeyboard === 'boolean') isSystemKeyboardOn.value = stored.systemKeyboard;
  };

  const setSound = (isOn: boolean) => {
    isSoundOn.value = isOn;
    save();
  };

  const setLanguage = (chosen: Language) => {
    language.value = chosen;
    save();
  };

  const setReduceMotion = (chosen: MotionChoice) => {
    reduceMotion.value = chosen;
    save();
  };

  const setHighContrast = (isOn: boolean) => {
    isHighContrast.value = isOn;
    save();
  };

  const setWaitForNext = (isOn: boolean) => {
    isWaitForNextOn.value = isOn;
    save();
  };

  const setSystemKeyboard = (isOn: boolean) => {
    isSystemKeyboardOn.value = isOn;
    save();
  };

  return { isSoundOn, language, reduceMotion, isMotionReduced, isHighContrast, isWaitForNextOn, isSystemKeyboardOn, load, setSound, setLanguage, setReduceMotion, setHighContrast, setWaitForNext, setSystemKeyboard };
});
