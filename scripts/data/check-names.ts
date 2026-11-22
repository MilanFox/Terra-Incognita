import { normaliseKeys } from '../../shared/utils/normalise.ts';
import { languages } from './steps/names.ts';
import type { CheckLine } from './check.ts';
import type { AliasRulings, Names } from './steps/names.ts';

export type NamesCheck = { lines: CheckLine[], warnings: string[] };

const everyPlaceHasNames = (names: Names, placeIds: string[]): CheckLine => ({
  label: 'every place has an EN and a DE name',
  failures: placeIds.flatMap(id => languages
    .filter(language => !names[id]?.[language].name)
    .map(language => `${id} has no ${language} name`)),
});

const nameOverridesAreKnown = (aliasRulings: AliasRulings, placeIds: string[]): CheckLine => ({
  label: 'every display-name override is for a place, in EN or DE',
  failures: Object.entries(aliasRulings).flatMap(([id, { name }]) => [
    ...(name && !placeIds.includes(id) ? [`${id}: unknown id`] : []),
    ...Object.keys(name ?? {})
      .filter(language => !languages.some(known => known === language))
      .map(language => `${id} ${language}: unknown language`),
  ]),
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

type NamesCheckInput = { names: Names, placeIds: string[], unusedDrops: string[], aliasRulings: AliasRulings };

export const checkNames = ({ names, placeIds, unusedDrops, aliasRulings }: NamesCheckInput): NamesCheck => ({
  lines: [everyPlaceHasNames(names, placeIds), nameOverridesAreKnown(aliasRulings, placeIds)],
  warnings: [
    ...identicalKeys(names).map(collision => `names normalise identically for two places: ${collision}`),
    ...unusedDrops.map(drop => `alias drop matches nothing: ${drop}`),
  ],
});
