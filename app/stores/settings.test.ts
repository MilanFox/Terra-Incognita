import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from './settings';

const storedSettings = () => JSON.parse(localStorage.getItem('ti:settings') ?? 'null');

const loadedSettings = () => {
  setActivePinia(createPinia());
  const settings = useSettingsStore();
  settings.load();
  return settings;
};

describe('tap delay setting', () => {
  beforeEach(() => localStorage.clear());

  it('starts at 150 ms and saves it on the first load', () => {
    expect(loadedSettings().tapDelayMs).toBe(150);
    expect(storedSettings().tapDelay).toBe(150);
  });

  it('keeps a chosen delay across loads, next to the other settings', () => {
    localStorage.setItem('ti:settings', JSON.stringify({ sound: false, language: 'de' }));
    loadedSettings().setTapDelay(500);
    expect(storedSettings()).toMatchObject({ sound: false, language: 'de', tapDelay: 500 });
    expect(loadedSettings().tapDelayMs).toBe(500);
  });

  it.each([250, '300', null])('falls back to 150 ms for a stored delay of %j', (tapDelay) => {
    localStorage.setItem('ti:settings', JSON.stringify({ tapDelay }));
    expect(loadedSettings().tapDelayMs).toBe(150);
  });

  it('falls back to 150 ms when settings from before the choice existed are loaded', () => {
    localStorage.setItem('ti:settings', JSON.stringify({ sound: true, language: 'en' }));
    expect(loadedSettings().tapDelayMs).toBe(150);
  });
});
