import type { NaturalEarth } from './load.ts';

// Carved places have no NE feature of their own and so no figure; -1 ranks them below every POP_EST (G13).
export const easeRanks = (naturalEarth: NaturalEarth, placeIds: string[]): Map<string, number> => {
  const populationById = new Map(naturalEarth.countries.features.map(({ properties: { ADM0_A3, POP_EST } }) =>
    [ADM0_A3, typeof POP_EST === 'number' ? POP_EST : -1]));
  const populationOf = (id: string) => populationById.get(id) ?? -1;
  const ranked = [...placeIds].sort((first, second) =>
    populationOf(second) - populationOf(first) || (first < second ? -1 : 1));
  return new Map(ranked.map((id, index) => [id, index + 1]));
};
