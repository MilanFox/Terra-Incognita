import { fetchText, writeSnapshots } from './snapshot.ts';

export const cldrVersion = '49';
export const cldrLanguages = ['en', 'de'] as const;

const tag = `${cldrVersion}.0.0`;
const baseUrl = `https://raw.githubusercontent.com/unicode-org/cldr-json/${tag}/cldr-json`;

export type CldrSnapshot = { cldrVersion: string, territories: Record<string, string> };

export const cldrSnapshotName = (language: string) => `cldr-${language}-territories.json`;

const sortedByKey = (entries: Record<string, string>) =>
  Object.fromEntries(Object.entries(entries).sort(([first], [second]) => first.localeCompare(second)));

export const fetchCldr = async () => {
  console.log(`CLDR v${cldrVersion}`);
  const { cldrVersion: tagVersion } = JSON.parse(await fetchText(`${baseUrl}/cldr-localenames-full/package.json`));
  if (tagVersion !== cldrVersion) throw new Error(`cldr-json ${tag} is CLDR ${tagVersion}, expected ${cldrVersion}`);
  const snapshots: Record<string, string> = {};
  for (const language of cldrLanguages) {
    const url = `${baseUrl}/cldr-localenames-full/main/${language}/territories.json`;
    const { main } = JSON.parse(await fetchText(url));
    const snapshot: CldrSnapshot = {
      cldrVersion,
      territories: sortedByKey(main[language].localeDisplayNames.territories),
    };
    snapshots[cldrSnapshotName(language)] = `${JSON.stringify(snapshot, null, 1)}\n`;
  }
  writeSnapshots('cldr', snapshots, { version: cldrVersion });
};
