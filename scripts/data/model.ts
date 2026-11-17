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

export const isInTier = (placeTier: Tier | undefined, tier: Tier) =>
  placeTier !== undefined && tiers.includes(placeTier) && tiers.indexOf(placeTier) <= tiers.indexOf(tier);

export type TieredPlaces = Record<string, { tier: Tier, holder?: string }>;

const holderOutside = (places: TieredPlaces, id: string, tier: Tier) => {
  const place = places[id];
  return place && !isInTier(place.tier, tier) ? place.holder : undefined;
};

export const holderChain = (places: TieredPlaces, id: string, tier: Tier) => {
  const chain = [id];
  let holder = holderOutside(places, id, tier);
  while (holder && !chain.includes(holder)) {
    chain.push(holder);
    holder = holderOutside(places, holder, tier);
  }
  return holder ? [...chain, holder] : chain;
};

export const drawnAs = (places: TieredPlaces, id: string, tier: Tier) => {
  const end = holderChain(places, id, tier).at(-1);
  return end !== undefined && isInTier(places[end]?.tier, tier) ? end : undefined;
};

export type Bbox = [west: number, south: number, east: number, north: number];

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
  silhouette: boolean
  bbox: Bbox | undefined
};

export const countByTier = (places: Place[]) => Object.fromEntries(
  tiers.map(tier => [tier, places.filter(place => place.tier === tier).length]),
) as Record<Tier, number>;

export const byId = <Item extends { id: string }>(first: Item, second: Item) => {
  if (first.id === second.id) return 0;
  return first.id < second.id ? -1 : 1;
};
