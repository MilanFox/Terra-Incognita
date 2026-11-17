import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { byId } from '../model.ts';
import { curatedDir } from '../paths.ts';
import { cldrLanguages, cldrSnapshotName } from '../sources/cldr.ts';
import { mledozeSnapshotName } from '../sources/mledoze.ts';
import { readSnapshot } from '../sources/snapshot.ts';
import { wikidataSnapshotName } from '../sources/wikidata.ts';
import type { Curated } from '../curated.ts';
import type { Place } from '../model.ts';
import type { CldrSnapshot } from '../sources/cldr.ts';
import type { MledozeCountry } from '../sources/mledoze.ts';
import type { WikidataBinding } from '../sources/wikidata.ts';
import type { NaturalEarth } from './load.ts';

export const languages = cldrLanguages;
export type Language = typeof languages[number];

export type LocalisedName = { name: string, aliases: string[] };
export type PlaceNames = Record<Language, LocalisedName> & { capitals: Record<string, Record<Language, LocalisedName>> };
export type Names = Record<string, PlaceNames>;

export type AliasRuling = {
  note?: string
  add?: Partial<Record<Language, string[]>> & { capitals?: Record<string, Partial<Record<Language, string[]>>> }
  drop?: { lang: Language, capital?: string, alias: string, why: string }[]
};
export type AliasRulings = Record<string, AliasRuling>;

type WikidataItem = { labels: Partial<Record<string, string>>, altLabels: Record<Language, string[]> };

export type NameSources = {
  cldr: Record<Language, Record<string, string>>
  mledoze: MledozeCountry[]
  wikidata: Map<string, WikidataItem>
  aliasRulings: AliasRulings
};

export const odbl = 'Contains aliases derived from mledoze/countries (Open Database License 1.0, '
  + 'https://opendatacommons.org/licenses/odbl/1-0/); this file is shared under the same licence.';

// The mledoze entry of Kosovo is UNK, not NE's KOS.
const mledozeCodeOverrides: Record<string, string> = { KOS: 'UNK' };

const shortCode = /^(?:[A-Z]{2,3}|[a-z]{2,3})$/;
const machineCode = /^[A-Z]{2}-[A-Z0-9]{1,3}$|ISO 3166|^[A-Za-z]+\/[A-Za-z_]+$|^[^\p{L}]*$/u;
const nonLatinScript = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

// CLDR is exempt from the short-code filter: it supplies "UK" and "US".
export const isFilteredOut = (text: string, source: string) =>
  (source !== 'cldr' && shortCode.test(text)) || machineCode.test(text) || nonLatinScript.test(text);

const entityId = (uri: string | undefined) => uri?.replace('http://www.wikidata.org/entity/', '');

const wikidataItems = (bindings: WikidataBinding[]) => {
  const items = new Map<string, WikidataItem>();
  for (const { item, kind, text } of bindings) {
    const qid = entityId(item?.value);
    const language = text?.['xml:lang'];
    if (!qid || !text || !language) continue;
    const entry = items.get(qid) ?? { labels: {}, altLabels: { en: [], de: [] } };
    items.set(qid, entry);
    if (kind.value === 'label') entry.labels[language] = text.value;
    if (kind.value === 'altLabel' && (language === 'en' || language === 'de')) entry.altLabels[language].push(text.value);
  }
  return items;
};

export const loadNameSources = (): NameSources => ({
  cldr: Object.fromEntries(languages.map(language => [
    language,
    readSnapshot<CldrSnapshot>(cldrSnapshotName(language)).territories,
  ])) as NameSources['cldr'],
  mledoze: readSnapshot<MledozeCountry[]>(mledozeSnapshotName),
  wikidata: wikidataItems(readSnapshot<{ bindings: WikidataBinding[] }>(wikidataSnapshotName).bindings),
  aliasRulings: JSON.parse(readFileSync(resolve(curatedDir, 'aliases.json'), 'utf8')),
});

const neNamesOf = (id: string, naturalEarth: NaturalEarth, curated: Curated): Partial<Record<Language, string>> => {
  const carve = curated.carve[id];
  const neProperties = carve?.source === 'breakaway'
    ? naturalEarth.breakaway.features.find(({ properties }) => properties.BRK_A3 === carve.brkA3)?.properties
    : naturalEarth.countries.features.find(({ properties }) => properties.ADM0_A3 === id)?.properties;
  return { en: neProperties?.NAME_EN as string | undefined, de: neProperties?.NAME_DE as string | undefined };
};

// The first text is the display name, if there is one; later texts are aliases, deduplicated case-insensitively.
export const collectTexts = () => {
  let name = '';
  const aliases: string[] = [];
  const isKnown = (text: string) => [name, ...aliases].some(known => known.toLowerCase() === text.toLowerCase());
  return {
    setName: (text: string | undefined) => {
      name = text?.normalize('NFC').trim() ?? '';
    },
    addAlias: (text: string) => {
      if (!isKnown(text)) aliases.push(text);
    },
    result: (): LocalisedName => ({ name, aliases }),
  };
};

type NeInputs = { naturalEarth: NaturalEarth, curated: Curated };

type NameContext = { place: Place, neNames: Partial<Record<Language, string>>, sources: NameSources };

const mledozeCountryOf = ({ id, iso2 }: Place, mledoze: MledozeCountry[]) =>
  mledoze.find(({ cca3 }) => cca3 === (mledozeCodeOverrides[id] ?? id))
  ?? (iso2 ? mledoze.find(({ cca2 }) => cca2 === iso2) : undefined);

const cldrAlternatives = (language: Language, { place, sources }: NameContext) =>
  Object.entries(sources.cldr[language])
    .filter(([key]) => place.iso2 && key.startsWith(`${place.iso2}-alt-`))
    .map(([, alternative]) => alternative);

const sourceTexts = (language: Language, context: NameContext): [string | undefined, string][] => {
  const { place, neNames, sources } = context;
  const wikidataItem = place.qid ? sources.wikidata.get(place.qid) : undefined;
  const country = mledozeCountryOf(place, sources.mledoze);
  const mledozeTexts = language === 'en'
    ? [country?.name.common, country?.name.official, ...(country?.altSpellings ?? [])]
    : [country?.translations.deu?.common, country?.translations.deu?.official];
  return [
    ...cldrAlternatives(language, context).map((text): [string, string] => [text, 'cldr']),
    ...[wikidataItem?.labels[language], wikidataItem?.labels.mul, ...(wikidataItem?.altLabels[language] ?? [])]
      .map((text): [string | undefined, string] => [text, 'wikidata']),
    ...mledozeTexts.map((text): [string | undefined, string] => [text, 'mledoze']),
    [neNames[language], 'ne'],
  ];
};

const localisedNameOf = (language: Language, context: NameContext, usedDrops: Set<string>): LocalisedName => {
  const { place: { id, iso2 }, neNames, sources } = context;
  const hand = sources.aliasRulings[id];
  const texts = collectTexts();
  texts.setName((iso2 && sources.cldr[language][iso2]) || neNames[language]);
  for (const [text, source] of sourceTexts(language, context)) {
    const alias = text?.normalize('NFC').trim();
    if (!alias || isFilteredOut(alias, source)) continue;
    const drop = hand?.drop?.find(entry => !entry.capital && entry.lang === language
      && entry.alias.toLowerCase() === alias.toLowerCase());
    if (drop) usedDrops.add(`${id} ${language} "${drop.alias}"`);
    else texts.addAlias(alias);
  }
  for (const alias of hand?.add?.[language] ?? []) texts.addAlias(alias);
  return texts.result();
};

export const joinNames = (places: Place[], { naturalEarth, curated }: NeInputs, sources: NameSources) => {
  const usedDrops = new Set<string>();
  const names: Names = {};
  for (const place of places) {
    const context = { place, neNames: neNamesOf(place.id, naturalEarth, curated), sources };
    names[place.id] = {
      en: localisedNameOf('en', context, usedDrops),
      de: localisedNameOf('de', context, usedDrops),
      capitals: {},
    };
  }
  const unusedDrops = Object.entries(sources.aliasRulings)
    .flatMap(([id, { drop = [] }]) => drop.filter(({ capital }) => !capital).map(({ lang, alias }) => `${id} ${lang} "${alias}"`))
    .filter(drop => !usedDrops.has(drop));
  return { names, unusedDrops };
};

export const namesText = (names: Names) => {
  const lines = Object.entries(names)
    .map(([id, placeNames]) => ({ id, placeNames }))
    .sort((first, second) => byId(first, second))
    .map(({ id, placeNames }) => `${JSON.stringify(id)}:${JSON.stringify(placeNames)}`);
  return `{\n"_license":${JSON.stringify(odbl)},\n${lines.join(',\n')}\n}\n`;
};
