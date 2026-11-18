import type { Answer } from './game';
import type { Resolution } from './matcher';

export const fillBudgetPerPlaceMs = 6000;

export type FillInput
  = | { kind: 'filled' | 'duplicate', placeId: string }
    | { kind: 'outside' | 'ambiguous' | 'none' };

export const judgeFill = (resolution: Resolution, poolPlaceIds: readonly string[], filledPlaceIds: readonly string[]): FillInput => {
  if (resolution.outcome !== 'match') return { kind: resolution.outcome };
  const { placeId } = resolution;
  if (!poolPlaceIds.includes(placeId)) return { kind: 'outside' };
  return { kind: filledPlaceIds.includes(placeId) ? 'duplicate' : 'filled', placeId };
};

export const isStoredFill = (storedAnswers: Answer[], storedDeck: string[], storedIndex: number) => storedIndex === 0
  && new Set(storedAnswers.map(({ placeId }) => placeId)).size === storedAnswers.length
  && storedAnswers.every(({ placeId, outcome }) => outcome === 'right' && storedDeck.includes(placeId))
  && storedAnswers.length < storedDeck.length;
