import { describe, expect, it } from 'vitest';
import { shouldShowSafariHint } from './safariHint';

const iPhoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const iPhoneChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1';
const desktopChrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const androidChrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const firefoxIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15';

describe('Safari hint', () => {
  it.each([['iPhone Safari', iPhoneSafari], ['Mac Safari', macSafari]])('shows in %s when not installed', (_name, userAgent) => {
    expect(shouldShowSafariHint({ userAgent, isInstalled: false })).toBe(true);
  });

  it('stays away once the app is installed', () => {
    expect(shouldShowSafariHint({ userAgent: iPhoneSafari, isInstalled: true })).toBe(false);
  });

  it.each([['Chrome on iOS', iPhoneChrome], ['Chrome on desktop', desktopChrome], ['Chrome on Android', androidChrome], ['Firefox on iOS', firefoxIos]])('stays away in %s', (_name, userAgent) => {
    expect(shouldShowSafariHint({ userAgent, isInstalled: false })).toBe(false);
  });
});
