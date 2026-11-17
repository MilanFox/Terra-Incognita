import { runMapshaper } from '../mapshaper.ts';
import { drawnAs, featureCollection, tiers } from '../model.ts';
import type { Feature, Land, LandProperties, Tier, TieredPlaces } from '../model.ts';

export type TierMaps = Record<Tier, Land>;

// Only holders are dissolved, so land that no tier merges stays byte-identical in every map. A broken holder chain
// leaves the land under its own id; the check reports the chain and the feature count.
const dissolveTier = async (map: Land, places: TieredPlaces, tier: Tier): Promise<Land> => {
  const relabelled = map.features.map((feature) => {
    const { id, unclaimed } = feature.properties;
    const drawnId = unclaimed ? id : (drawnAs(places, id, tier) ?? id);
    return { ...feature, properties: { ...feature.properties, id: drawnId } };
  });
  const holderIds = new Set(relabelled
    .filter((feature, index) => feature.properties.id !== map.features[index]?.properties.id)
    .map(({ properties }) => properties.id));
  if (!holderIds.size) return map;
  const isHolder = ({ properties }: Feature<LandProperties>) => holderIds.has(properties.id);
  const holders = await runMapshaper<LandProperties>({
    inputs: { 'land.json': featureCollection(relabelled.filter(isHolder)) },
    commands: '-i land.json -dissolve id',
    outputOptions: 'precision=0.001',
  });
  return featureCollection([...relabelled.filter(feature => !isHolder(feature)), ...holders.features]);
};

export const dissolve = async (map: Land, places: TieredPlaces): Promise<TierMaps> => {
  const maps: Partial<TierMaps> = {};
  for (const tier of tiers) maps[tier] = await dissolveTier(map, places, tier);
  return maps as TierMaps;
};
