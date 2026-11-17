export type Ring = [number, number][];

export type Geometry
  = | { type: 'Polygon', coordinates: Ring[] }
    | { type: 'MultiPolygon', coordinates: Ring[][] };

export type Feature<Properties> = { type: 'Feature', properties: Properties, geometry: Geometry | null };

export type FeatureCollection<Properties> = { type: 'FeatureCollection', features: Feature<Properties>[] };

export const featureCollection = <Properties>(features: Feature<Properties>[]): FeatureCollection<Properties> => ({
  type: 'FeatureCollection',
  features,
});

export const polygonsOf = (geometry: Geometry | null): Ring[][] => {
  if (!geometry) return [];
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
};

export const tiers = ['sovereign', 'defacto', 'dependencies'] as const;
export type Tier = typeof tiers[number];

export const regions = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'] as const;
export type Region = typeof regions[number];

export type LandProperties = { id: string, unclaimed?: true };
export type Land = FeatureCollection<LandProperties>;

export type Place = {
  id: string
  qid: string | undefined
  iso2: string | undefined
  tier: Tier
  holder: string | undefined
  region: string | undefined
};

export const countByTier = (places: Place[]) => Object.fromEntries(
  tiers.map(tier => [tier, places.filter(place => place.tier === tier).length]),
) as Record<Tier, number>;

export const byId = <Item extends { id: string }>(first: Item, second: Item) => {
  if (first.id === second.id) return 0;
  return first.id < second.id ? -1 : 1;
};
