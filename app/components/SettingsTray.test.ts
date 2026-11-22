import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { useSettingsStore } from '~/stores/settings';
import SettingsTray from './SettingsTray.vue';

describe('settings tray tap delay', () => {
  it('offers Short, Medium and Long with their delays, and saves the one tapped', async () => {
    const settings = useSettingsStore();
    settings.setTapDelay(150);
    const tray = await mountSuspended(SettingsTray);
    const label = tray.findAll('.radio-tiles__label').find(candidate => candidate.text() === 'Tap delay')!;
    const radios = tray.findAll(`[role="radiogroup"][aria-labelledby="${label.attributes('id')}"] [role="radio"]`);

    expect(radios.map(radio => radio.attributes('aria-label'))).toEqual(['Short, 150 milliseconds', 'Medium, 300 milliseconds', 'Long, 500 milliseconds']);
    expect(radios.map(radio => radio.find('.radio-tiles__detail').text())).toEqual(['150 ms', '300 ms', '500 ms']);
    expect(radios.map(radio => radio.attributes('aria-checked'))).toEqual(['true', 'false', 'false']);

    await radios[2]!.trigger('click');

    expect(settings.tapDelayMs).toBe(500);
    expect(JSON.parse(localStorage.getItem('ti:settings')!).tapDelay).toBe(500);
    expect(radios.map(radio => radio.attributes('aria-checked'))).toEqual(['false', 'false', 'true']);
  });
});
