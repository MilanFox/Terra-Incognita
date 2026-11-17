import { regions } from '../model.ts';
import type { Curated } from '../curated.ts';
import type { Place, Region } from '../model.ts';
import type { PlaceFacts } from './compute.ts';
import type { PlaceSource } from './rule.ts';

const northAmericanSubregions = ['Northern America', 'Central America', 'Caribbean'];

// NE's "Seven seas (open ocean)" is not an M49 subregion; those places need a curated region.
const m49Region = (source: PlaceSource | undefined): Region | undefined => {
  if (!source || source.m49.subregion === 'Seven seas (open ocean)') return undefined;
  const { regionUn, subregion } = source.m49;
  if (regionUn === 'Americas' && subregion === 'South America') return 'South America';
  if (regionUn === 'Americas' && northAmericanSubregions.includes(subregion)) return 'North America';
  if (regionUn === 'Americas') return undefined;
  return regions.find(region => region === regionUn);
};

export const join = (curated: Curated, sources: Map<string, PlaceSource>, facts: Map<string, PlaceFacts>): Place[] =>
  Object.entries(curated.places).map(([id, entry]) => {
    const source = sources.get(id);
    return {
      id,
      qid: entry.qid ?? source?.qid,
      iso2: entry.iso2 ?? source?.iso2,
      tier: entry.tier,
      holder: entry.holder,
      region: entry.region ?? m49Region(source),
      silhouette: entry.silhouette !== false,
      bbox: facts.get(id)?.bbox,
    };
  });
