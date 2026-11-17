import { polygonsOf } from '../model.ts';
import { readSnapshot } from '../sources/snapshot.ts';
import { wikidataSnapshotName } from '../sources/wikidata.ts';
import { collectTexts, isFilteredOut, languages } from './names.ts';
import type { Curated } from '../curated.ts';
import type { Land, Place, Ring } from '../model.ts';
import type { WikidataBinding } from '../sources/wikidata.ts';
import type { AliasRulings, Language, LocalisedName } from './names.ts';

export type ShippedPlace = Place & { flag: string | null, capitals: string[] };
export type CapitalNames = Record<string, Record<Language, LocalisedName>>;

type Capital = {
  labels: Partial<Record<string, string>>
  altLabels: Record<Language, string[]>
  coordinates: [number, number][]
};

export type CapitalSources = {
  capital: Map<string, Capital>
  capitalsOfItem: Map<string, Set<string>>
  aliasRulings: AliasRulings
};

const entityId = (uri: string | undefined) => uri?.replace('http://www.wikidata.org/entity/', '');

const qidNumber = (qid: string) => Number(qid.slice(1));

const bySortedQid = (first: string, second: string) => qidNumber(first) - qidNumber(second);

export const loadCapitalSources = (aliasRulings: AliasRulings): CapitalSources => {
  const capital = new Map<string, Capital>();
  const capitalsOfItem = new Map<string, Set<string>>();
  const { bindings } = readSnapshot<{ bindings: WikidataBinding[] }>(wikidataSnapshotName);
  for (const { item, capital: capitalUri, kind, text } of bindings) {
    const qid = entityId(capitalUri?.value);
    if (!qid) continue;
    const entry = capital.get(qid) ?? { labels: {}, altLabels: { en: [], de: [] }, coordinates: [] };
    capital.set(qid, entry);
    const language = text?.['xml:lang'];
    if (kind.value === 'capital') {
      const itemQid = entityId(item?.value);
      if (itemQid) capitalsOfItem.set(itemQid, (capitalsOfItem.get(itemQid) ?? new Set()).add(qid));
    }
    if (kind.value === 'capitalLabel' && text && language) entry.labels[language] = text.value;
    if (kind.value === 'capitalAltLabel' && text && (language === 'en' || language === 'de')) entry.altLabels[language].push(text.value);
    const point = kind.value === 'capitalCoordinates' ? text?.value.match(/^Point\((\S+) (\S+)\)$/) : null;
    if (point) entry.coordinates.push([Number(point[1]), Number(point[2])]);
  }
  return { capital, capitalsOfItem, aliasRulings };
};

const isInsideRing = ([x, y]: [number, number], ring: Ring) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index]!;
    const [x2, y2] = ring[previous]!;
    if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
};

const ownPolygons = (land: Land, id: string) =>
  land.features.filter(({ properties }) => properties.id === id).flatMap(({ geometry }) => polygonsOf(geometry));

const isInsideLand = (point: [number, number], polygons: Ring[][]) =>
  polygons.some(([outer, ...holes]) => outer !== undefined && isInsideRing(point, outer) && !holes.some(hole => isInsideRing(point, hole)));

const kilometresToSegment = ([x, y]: [number, number], start: number[], end: number[]) => {
  const kilometresPerDegreeLongitude = Math.cos(y * Math.PI / 180) * 111.32;
  const kilometresPerDegreeLatitude = 110.57;
  const startX = (start[0]! - x) * kilometresPerDegreeLongitude;
  const startY = (start[1]! - y) * kilometresPerDegreeLatitude;
  const deltaX = (end[0]! - start[0]!) * kilometresPerDegreeLongitude;
  const deltaY = (end[1]! - start[1]!) * kilometresPerDegreeLatitude;
  const along = Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / (deltaX * deltaX + deltaY * deltaY || 1)));
  return Math.hypot(startX + along * deltaX, startY + along * deltaY);
};

const kilometresToLand = (point: [number, number], polygons: Ring[][]) =>
  Math.min(...polygons.flat().flatMap(ring => ring.slice(1).map((vertex, index) => kilometresToSegment(point, ring[index]!, vertex))));

// NE's 1:10m coastline drops a few coastal and atoll capitals (Funafuti, Tarawa) a few km into the sea.
const coastalToleranceKilometres = 10;

const isInsidePlace = (capital: Capital | undefined, polygons: Ring[][]) =>
  capital?.coordinates.some(point => isInsideLand(point, polygons)) ?? false;

const isNearPlace = (capital: Capital | undefined, polygons: Ring[][]) =>
  capital?.coordinates.some(point => kilometresToLand(point, polygons) <= coastalToleranceKilometres) ?? false;

export const candidateCapitalsOf = ({ qid }: Place, curatedCapitals: string[] | undefined, sources: CapitalSources) =>
  curatedCapitals ?? [...(qid ? sources.capitalsOfItem.get(qid) ?? [] : [])].sort(bySortedQid);

// The place's own land, the same in every tier (G8): the dependencies map draws each place, unsimplified.
// A place with no capital strictly inside falls back to the capitals within the coastal tolerance.
export const joinCapitals = (places: Place[], { curated, land }: { curated: Curated, land: Land }, sources: CapitalSources) => {
  const candidates: Record<string, string[]> = {};
  const capitals: Record<string, string[]> = {};
  const coastal: string[] = [];
  for (const place of places) {
    const polygons = ownPolygons(land, place.id);
    const candidatesOfPlace = candidateCapitalsOf(place, curated.places[place.id]?.capitals, sources);
    const inside = candidatesOfPlace.filter(qid => isInsidePlace(sources.capital.get(qid), polygons));
    const near = inside.length ? [] : candidatesOfPlace.filter(qid => isNearPlace(sources.capital.get(qid), polygons));
    candidates[place.id] = candidatesOfPlace;
    capitals[place.id] = inside.length ? inside : near;
    coastal.push(...near.map(qid => `${place.id} ${qid}`));
  }
  return { candidates, capitals, coastal };
};

type CapitalOwner = { language: Language, placeId: string, qid: string };

const capitalNameOf = ({ language, placeId, qid }: CapitalOwner, sources: CapitalSources, usedDrops: Set<string>) => {
  const capital = sources.capital.get(qid);
  const hand = sources.aliasRulings[placeId];
  const texts = collectTexts();
  const labelTexts = [capital?.labels[language], capital?.labels.mul, capital?.labels.en];
  texts.setName(labelTexts.find(Boolean));
  for (const text of capital?.altLabels[language] ?? []) {
    const alias = text?.normalize('NFC').trim();
    if (!alias || isFilteredOut(alias, 'wikidata')) continue;
    const drop = hand?.drop?.find(entry => entry.capital === qid && entry.lang === language
      && entry.alias.toLowerCase() === alias.toLowerCase());
    if (drop) usedDrops.add(dropKey(placeId, drop));
    else texts.addAlias(alias);
  }
  for (const alias of hand?.add?.capitals?.[qid]?.[language] ?? []) texts.addAlias(alias);
  return texts.result();
};

const dropKey = (placeId: string, { lang, capital, alias }: { lang: Language, capital?: string, alias: string }) =>
  `${placeId} ${lang} ${capital} "${alias}"`;

export const capitalNames = (capitals: Record<string, string[]>, sources: CapitalSources) => {
  const usedDrops = new Set<string>();
  const names: Record<string, CapitalNames> = {};
  for (const [placeId, qids] of Object.entries(capitals)) {
    names[placeId] = Object.fromEntries(qids.map(qid => [
      qid,
      Object.fromEntries(languages.map(language => [language, capitalNameOf({ language, placeId, qid }, sources, usedDrops)])),
    ])) as CapitalNames;
  }
  const unusedDrops = Object.entries(sources.aliasRulings)
    .flatMap(([placeId, { drop = [] }]) => drop.filter(({ capital }) => capital).map(entry => dropKey(placeId, entry)))
    .filter(drop => !usedDrops.has(drop));
  const unusedAdditions = Object.entries(sources.aliasRulings)
    .flatMap(([placeId, { add }]) => Object.keys(add?.capitals ?? {}).map(qid => ({ placeId, qid })))
    .filter(({ placeId, qid }) => !capitals[placeId]?.includes(qid))
    .map(({ placeId, qid }) => `${placeId} ${qid}`);
  return { names, unusedDrops, unusedAdditions };
};
