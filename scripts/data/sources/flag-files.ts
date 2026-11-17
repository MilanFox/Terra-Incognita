import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { byId } from '../model.ts';
import { curatedDir, shippedDir } from '../paths.ts';
import type { WikidataBinding } from './wikidata.ts';

export const flagSnapshotDir = 'flags';
export const flagLicencesName = 'licences.json';
export const flagSvgName = (id: string) => `${id}.svg`;

export type FlagLicence = {
  file: string
  license: string | null
  artist: string | null
  attributionRequired: boolean
  licenseUrl: string | null
};

export type FlagPlace = { id: string, qid: string | undefined };
export type FlagRulings = Record<string, string | null>;
const flagFilePrefix = 'Special:FilePath/';

export const readFlagRulings = (): FlagRulings => JSON.parse(readFileSync(resolve(curatedDir, 'flags.json'), 'utf8'));

const wikidataFlagsByQid = (bindings: WikidataBinding[]) => {
  const flagsByQid = new Map<string, string[]>();
  for (const { item, kind, text } of bindings) {
    if (kind.value !== 'flag' || !item || !text) continue;
    const qid = item.value.replace('http://www.wikidata.org/entity/', '');
    const file = decodeURIComponent(text.value.slice(text.value.indexOf(flagFilePrefix) + flagFilePrefix.length));
    flagsByQid.set(qid, [...(flagsByQid.get(qid) ?? []), file].sort());
  }
  return flagsByQid;
};

// The Commons file of every place with a flag: the curated ruling, else the single P41 flag. A place whose P41 flags
// are none or several, and is not ruled, is a failure.
export const resolveFlagFiles = (places: FlagPlace[], rulings: FlagRulings, bindings: WikidataBinding[]) => {
  const flagsByQid = wikidataFlagsByQid(bindings);
  const files: Record<string, string> = {};
  const flagless: string[] = [];
  const failures = Object.keys(rulings).filter(id => !places.some(place => place.id === id)).map(id => `${id} is ruled in flags.json but is not a place`);
  for (const { id, qid } of [...places].sort(byId)) {
    const candidates = flagsByQid.get(qid ?? '') ?? [];
    const ruling = rulings[id];
    if (ruling === null) flagless.push(id);
    else if (ruling) files[id] = ruling;
    else if (candidates.length === 1) files[id] = candidates[0]!;
    else failures.push(`${id} has ${candidates.length ? `several P41 flags (${candidates.join('; ')})` : 'no P41 flag'}: rule it in data/curated/flags.json`);
  }
  return { files, flagless, failures };
};

export const readShippedFlagPlaces = (): FlagPlace[] => JSON.parse(readFileSync(resolve(shippedDir, 'places.json'), 'utf8'));
