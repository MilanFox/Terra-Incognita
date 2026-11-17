import { runMapshaper } from '../mapshaper.ts';
import { featureCollection, polygonsOf } from '../model.ts';
import type { Carve, Curated, FeatureRuling } from '../curated.ts';
import type { Feature, Geometry, Land, LandProperties, Ring } from '../model.ts';
import type { NaturalEarth, NeCountry } from './load.ts';

export type PlaceSource = {
  qid?: string
  iso2?: string
  m49: { regionUn: string, subregion: string }
};

export type Ruled = { land: Land, sources: Map<string, PlaceSource> };

type BreakawayCarve = [string, Extract<Carve, { source: 'breakaway' }>];
type SplitCarve = [string, Extract<Carve, { source: 'split' }>];

const ownCode = (code: string) => (code && code !== '-99' ? code : undefined);

const m49Of = (country: NeCountry) => ({ regionUn: country.REGION_UN, subregion: country.SUBREGION });

const landFeature = (properties: LandProperties, geometry: Geometry | null): Feature<LandProperties> => ({
  type: 'Feature',
  properties,
  geometry,
});

const breakawayOf = (naturalEarth: NaturalEarth, [id, carve]: BreakawayCarve) => {
  const breakaway = naturalEarth.breakaway.features.find(({ properties }) => properties.BRK_A3 === carve.brkA3);
  if (!breakaway) throw new Error(`carve.json ${id}: no breakaway feature ${carve.brkA3} in Natural Earth`);
  return breakaway;
};

const eraseBreakaways = async (naturalEarth: NaturalEarth, breakaways: BreakawayCarve[]) => {
  const countries: Feature<NeCountry>[] = [];
  for (const country of naturalEarth.countries.features) {
    const carved = breakaways.filter(([, carve]) => carve.from === country.properties.ADM0_A3);
    if (!carved.length) {
      countries.push(country);
      continue;
    }
    const erased = await runMapshaper({
      inputs: {
        'host.json': featureCollection([country]),
        'cuts.json': featureCollection(carved.map(carve => breakawayOf(naturalEarth, carve))),
      },
      commands: '-i host.json -erase cuts.json',
    });
    countries.push({ ...country, geometry: erased.features[0]?.geometry ?? null });
  }
  return countries;
};

const isInside = (polygon: Ring[], [west, south, east, north]: [number, number, number, number]) =>
  (polygon[0] ?? []).every(([lon, lat]) => lon >= west && lon <= east && lat >= south && lat <= north);

const splitPart = (country: Feature<NeCountry>, [id, carve]: SplitCarve, siblings: SplitCarve[]) => {
  const polygons = polygonsOf(country.geometry);
  const matchCount = (polygon: Ring[]) => siblings.filter(([, sibling]) => isInside(polygon, sibling.bbox)).length;
  const unassigned = polygons.find(polygon => matchCount(polygon) !== 1);
  if (unassigned) {
    const at = JSON.stringify(unassigned[0]?.[0]);
    throw new Error(`carve.json: the part of ${carve.from} at ${at} is not in exactly one split bbox`);
  }
  const coordinates = polygons.filter(polygon => isInside(polygon, carve.bbox));
  if (!coordinates.length) throw new Error(`carve.json ${id}: its bbox holds no part of ${carve.from}`);
  return landFeature({ id }, { type: 'MultiPolygon', coordinates });
};

const ruledLand = (country: Feature<NeCountry>, ruling: FeatureRuling, curated: Curated) => {
  const id = country.properties.ADM0_A3;
  if (ruling.action === 'drop') return [];
  if (ruling.action === 'unclaimed') return [landFeature({ id, unclaimed: true }, country.geometry)];
  if (!curated.places[ruling.into]) throw new Error(`features.json ${id}: merge target ${ruling.into} is not a place`);
  return [landFeature({ id: ruling.into }, country.geometry)];
};

export const rule = async (naturalEarth: NaturalEarth, curated: Curated): Promise<Ruled> => {
  const carves = Object.entries(curated.carve);
  const breakaways = carves.filter((carve): carve is BreakawayCarve => carve[1].source === 'breakaway');
  const splits = carves.filter((carve): carve is SplitCarve => carve[1].source === 'split');
  const countryById = new Map(naturalEarth.countries.features.map(country => [country.properties.ADM0_A3, country]));
  const countryOf = ([id, carve]: [string, Carve]) => {
    const country = countryById.get(carve.from);
    if (!country) throw new Error(`carve.json ${id}: no Natural Earth feature ${carve.from}`);
    if (!curated.places[id]) throw new Error(`carve.json ${id}: not in places.json`);
    return country;
  };

  const land: Feature<LandProperties>[] = [];
  const sources = new Map<string, PlaceSource>();
  for (const country of await eraseBreakaways(naturalEarth, breakaways)) {
    const id = country.properties.ADM0_A3;
    const ruling = curated.features[id];
    if (ruling) {
      land.push(...ruledLand(country, ruling, curated));
    }
    else if (curated.places[id] && !curated.carve[id]) {
      land.push(landFeature({ id }, country.geometry));
      const { WIKIDATAID, ISO_A2_EH } = country.properties;
      sources.set(id, { qid: WIKIDATAID, iso2: ownCode(ISO_A2_EH), m49: m49Of(country.properties) });
    }
  }

  for (const breakaway of breakaways) {
    const { properties, geometry } = breakawayOf(naturalEarth, breakaway);
    const [id] = breakaway;
    land.push(landFeature({ id }, geometry));
    const host = countryOf(breakaway).properties;
    sources.set(id, { qid: properties.WIKIDATAID, iso2: ownCode(properties.ISO_A2), m49: m49Of(host) });
  }

  for (const split of splits) {
    const country = countryOf(split);
    land.push(splitPart(country, split, splits.filter(([, carve]) => carve.from === split[1].from)));
    sources.set(split[0], { m49: m49Of(country.properties) });
  }

  return { land: featureCollection(land), sources };
};
