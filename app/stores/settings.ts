import { defineStore } from 'pinia';

export type Language = 'en' | 'de';

const storageKey = 'ti:settings';
const languages: Language[] = ['en', 'de'];

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

  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify({ ...readStored(), sound: isSoundOn.value, language: language.value }));
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
  };

  const setSound = (isOn: boolean) => {
    isSoundOn.value = isOn;
    save();
  };

  const setLanguage = (chosen: Language) => {
    language.value = chosen;
    save();
  };

  return { isSoundOn, language, load, setSound, setLanguage };
});
