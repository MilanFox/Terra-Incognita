import { pieceAreaKm2 } from '../land-area.ts';
import { isInTier, tiers } from '../model.ts';
import { neighboursIn } from './borders.ts';
import type { Tier, TieredPlaces } from '../model.ts';
import type { Borders } from './borders.ts';

export const microstateMaxKm2 = 2500;

export type TierFacts = { neighbours: Record<Tier, string[]>, microstate: Record<Tier, boolean> };

const largestPieceKm2ById = ({ pieces }: Borders) => {
  const largest = new Map<string, number>();
  for (const { id, polygon } of pieces) largest.set(id, Math.max(largest.get(id) ?? 0, pieceAreaKm2(polygon)));
  return largest;
};

// A place outside a tier has no land of its own in that tier's map: no neighbours there, and not a microstate.
export const tierFacts = (borders: Record<Tier, Borders>, places: TieredPlaces): Map<string, TierFacts> => {
  const measured = tiers.map(tier => ({
    tier,
    neighbours: neighboursIn(borders[tier]),
    largestKm2: largestPieceKm2ById(borders[tier]),
  }));
  return new Map(Object.entries(places).map(([id, place]) => {
    const facts = { neighbours: {}, microstate: {} } as TierFacts;
    for (const { tier, neighbours, largestKm2 } of measured) {
      const isDrawn = isInTier(place.tier, tier);
      facts.neighbours[tier] = isDrawn ? neighbours.get(id) ?? [] : [];
      facts.microstate[tier] = isDrawn && (largestKm2.get(id) ?? 0) < microstateMaxKm2;
    }
    return [id, facts];
  }));
};
