import { countByTier, polygonsOf, regions, tiers } from './model.ts';
import type { Curated } from './curated.ts';
import type { Feature, Land, LandProperties, Place, Tier } from './model.ts';
import type { NaturalEarth } from './steps/load.ts';

export type CheckInput = { naturalEarth: NaturalEarth, curated: Curated, places: Place[], map: Land };
export type CheckLine = { label: string, failures: string[] };

const expectedTierCounts: Record<Tier, number> = { sovereign: 197, defacto: 6, dependencies: 42 };

const everyFeatureRuled = ({ naturalEarth, curated }: CheckInput): CheckLine => {
  const splitSources = new Set(Object.values(curated.carve)
    .filter(carve => carve.source === 'split')
    .map(carve => carve.from));
  const failures = naturalEarth.countries.features.flatMap(({ properties: { ADM0_A3: id } }) => {
    const rulings = [
      curated.places[id] && !curated.carve[id] ? 'places' : '',
      curated.features[id] ? 'features' : '',
      splitSources.has(id) ? 'carve' : '',
    ].filter(Boolean);
    if (rulings.length === 1) return [];
    return rulings.length ? [`${id} is ruled in both ${rulings.join(' and ')}`] : [`${id} is unruled`];
  });
  const featureCount = naturalEarth.countries.features.length;
  return { label: `every NE feature is ruled by places, features or carve (${featureCount})`, failures };
};

const tierCountsMatch = ({ places }: CheckInput): CheckLine => {
  const counts = countByTier(places);
  const wrongCounts = tiers
    .filter(tier => counts[tier] !== expectedTierCounts[tier])
    .map(tier => `${tier}: ${counts[tier]}, expected ${expectedTierCounts[tier]}`);
  const unknownTiers = places
    .filter(({ tier }) => !tiers.includes(tier))
    .map(({ id, tier }) => `${id} has tier "${tier}"`);
  return {
    label: `tier counts are ${tiers.map(tier => expectedTierCounts[tier]).join(' / ')}`,
    failures: [...wrongCounts, ...unknownTiers],
  };
};

const idsAreUnique = ({ naturalEarth, curated }: CheckInput): CheckLine => {
  const neIds = new Set(naturalEarth.countries.features.map(({ properties }) => properties.ADM0_A3));
  const patchIds = curated.patches.map(({ properties }) => properties.id);
  return {
    label: 'no duplicate ids',
    failures: [
      ...curated.duplicateKeys.map(key => `${key} appears twice`),
      ...patchIds.filter((id, index) => patchIds.indexOf(id) !== index).map(id => `${id} (patches) appears twice`),
      ...Object.keys(curated.carve)
        .filter(id => neIds.has(id))
        .map(id => `${id} (carve.json) is also an NE feature id`),
    ],
  };
};

const isDrawn = ({ geometry }: Feature<LandProperties>) =>
  polygonsOf(geometry).some(([outer]) => (outer?.length ?? 0) >= 4);

const everyPlaceHasGeometry = ({ places, map }: CheckInput): CheckLine => {
  const drawnIds = new Set(map.features.filter(isDrawn).map(({ properties }) => properties.id));
  return {
    label: 'every place has geometry',
    failures: places.filter(({ id }) => !drawnIds.has(id)).map(({ id }) => id),
  };
};

const everyPlaceHasRegion = ({ places }: CheckInput): CheckLine => ({
  label: 'every place has a region',
  failures: places
    .filter(({ region }) => !regions.some(known => known === region))
    .map(({ id, region }) => (region ? `${id} has region "${region}"` : id)),
});

const everyPlaceHasQid = ({ places }: CheckInput): CheckLine => ({
  label: 'every place has a QID',
  failures: places.filter(({ qid }) => !/^Q[1-9]\d*$/.test(qid ?? '')).map(({ id }) => id),
});

export const check = (input: CheckInput): CheckLine[] => [
  everyFeatureRuled,
  tierCountsMatch,
  idsAreUnique,
  everyPlaceHasGeometry,
  everyPlaceHasRegion,
  everyPlaceHasQid,
].map(line => line(input));
