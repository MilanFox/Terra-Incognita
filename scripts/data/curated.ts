import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { curatedDir } from './paths.ts';
import type { Feature, Tier } from './model.ts';

export type CuratedPlace = {
  tier: Tier
  holder?: string
  region?: string
  qid?: string
  iso2?: string
  silhouette?: false
  note?: string
};

export type FeatureRuling
  = | { action: 'merge', into: string, note?: string }
    | { action: 'drop', note?: string }
    | { action: 'unclaimed', note?: string };

export type Carve
  = | { from: string, source: 'breakaway', brkA3: string, note?: string }
    | { from: string, source: 'split', bbox: [number, number, number, number], note?: string };

export type Patch = Feature<{ id: string, cut?: string[], note?: string }>;

export type Curated = {
  places: Record<string, CuratedPlace>
  features: Record<string, FeatureRuling>
  carve: Record<string, Carve>
  patches: Patch[]
  duplicateKeys: string[]
};

const endOfString = (json: string, start: number) => {
  let index = start + 1;
  while (json[index] !== '"') index += json[index] === '\\' ? 2 : 1;
  return index;
};

const topLevelKeys = (json: string) => {
  const keys: string[] = [];
  let depth = 0;
  for (let index = 0; index < json.length; index++) {
    const char = json[index];
    if (char === '"') {
      const end = endOfString(json, index);
      if (depth === 1 && /^\s*:/.test(json.slice(end + 1))) keys.push(JSON.parse(json.slice(index, end + 1)));
      index = end;
    }
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') depth--;
  }
  return keys;
};

const duplicatesIn = (file: string, json: string) => topLevelKeys(json)
  .filter((key, index, keys) => keys.indexOf(key) !== index)
  .map(key => `${key} (${file})`);

const readText = (file: string) => readFileSync(resolve(curatedDir, file), 'utf8');

export const readCurated = (): Curated => {
  const keyedFiles = ['places.json', 'features.json', 'carve.json'].map(file => ({ file, json: readText(file) }));
  const [places, features, carve] = keyedFiles.map(({ json }) => JSON.parse(json));
  const patchFiles = readdirSync(resolve(curatedDir, 'patches')).filter(file => file.endsWith('.geojson')).sort();
  return {
    places,
    features,
    carve,
    patches: patchFiles.flatMap(file => JSON.parse(readText(`patches/${file}`)).features),
    duplicateKeys: keyedFiles.flatMap(({ file, json }) => duplicatesIn(file, json)),
  };
};
