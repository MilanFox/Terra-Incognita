import { normaliseKeys } from '../../shared/utils/normalise.ts';
import { languages } from './steps/names.ts';
import type { CheckLine } from './check.ts';
import type { Names } from './steps/names.ts';

export type NamesCheck = { lines: CheckLine[], warnings: string[] };

const everyPlaceHasNames = (names: Names, placeIds: string[]): CheckLine => ({
  label: 'every place has an EN and a DE name',
  failures: placeIds.flatMap(id => languages
    .filter(language => !names[id]?.[language].name)
    .map(language => `${id} has no ${language} name`)),
});

const textsOf = (placeNames: Names[string]) => languages.flatMap((language) => {
  const { name, aliases } = placeNames[language];
  return [name, ...aliases].map(text => ({ text: `${language} "${text}"`, keys: normaliseKeys(text) }));
});

const identicalKeys = (names: Names): string[] => {
  const holdersByKey = new Map<string, Map<string, string>>();
  for (const [id, placeNames] of Object.entries(names)) {
    for (const { text, keys } of textsOf(placeNames)) {
      for (const key of keys) {
        const holders = holdersByKey.get(key) ?? new Map<string, string>();
        holdersByKey.set(key, holders.set(id, holders.get(id) ?? text));
      }
    }
  }
  return [...holdersByKey]
    .filter(([key, holders]) => key && holders.size > 1)
    .map(([key, holders]) => `"${key}": ${[...holders].map(([id, source]) => `${id} (${source})`).join(', ')}`)
    .sort();
};

export const checkNames = (names: Names, placeIds: string[], unusedDrops: string[]): NamesCheck => ({
  lines: [everyPlaceHasNames(names, placeIds)],
  warnings: [
    ...identicalKeys(names).map(collision => `names normalise identically for two places: ${collision}`),
    ...unusedDrops.map(drop => `alias drop matches nothing: ${drop}`),
  ],
});
