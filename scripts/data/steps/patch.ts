import { runMapshaper } from '../mapshaper.ts';
import { featureCollection } from '../model.ts';
import type { Patch } from '../curated.ts';
import type { Feature, Land, LandProperties } from '../model.ts';

const applyPatch = async (land: Feature<LandProperties>[], patch: Patch) => {
  const { id, cut = [] } = patch.properties;
  if (!land.some(feature => feature.properties.id === id)) throw new Error(`patches: ${id} has no land to replace`);
  const isCut = (feature: Feature<LandProperties>) => cut.includes(feature.properties.id);
  const erased = await runMapshaper<LandProperties>({
    inputs: { 'cut.json': featureCollection(land.filter(isCut)), 'patch.json': featureCollection([patch]) },
    commands: '-i cut.json -erase patch.json',
  });
  const untouched = land.filter(feature => feature.properties.id !== id && !isCut(feature));
  return [...untouched, ...erased.features, { type: 'Feature' as const, properties: { id }, geometry: patch.geometry }];
};

export const patch = async (land: Land, patches: Patch[]): Promise<Land> => {
  let patched = land.features;
  for (const nextPatch of patches) patched = await applyPatch(patched, nextPatch);
  return featureCollection(patched);
};
