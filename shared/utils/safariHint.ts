export interface BrowserEnvironment {
  userAgent: string
  isInstalled: boolean
}

const otherBrowsers = /Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android/;

export const shouldShowSafariHint = ({ userAgent, isInstalled }: BrowserEnvironment) =>
  !isInstalled && /Safari/.test(userAgent) && !otherBrowsers.test(userAgent);
