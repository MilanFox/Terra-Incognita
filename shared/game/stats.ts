import { deepestTierPlayed } from './game';
import type { KeyValueStorage, Mode, Place, Tier, Variant } from './game';
import { createRecords } from './records';
import type { PlaceRecords } from './records';

export type Rating = 'noData' | 'weak' | 'shaky' | 'solid';

export const ratingsInRampOrder: Rating[] = ['noData', 'weak', 'shaky', 'solid'];

export interface StatsScope {
  mode?: Mode
  variant?: Variant
}

export type PlaceRatings = Record<string, Rating>;

export interface AllGamesStats {
  tier: Tier
  roundsPlayed: number
  placesSolid: number
  placesWeak: number
  placeRatings: PlaceRatings
}

export interface StatsDependencies {
  places: readonly Place[]
  storage: KeyValueStorage
}

const placesStorageKey = 'ti:places';
const regularModes: Mode[] = ['find', 'name', 'capital', 'country'];
const tiersInOrder: Tier[] = ['sovereign', 'defacto', 'dependencies'];
const fewestAnswersToJudge = 3;
const weakBelowShare = 0.5;
const solidFromShare = 0.8;

const ratingOf = (answers: readonly number[]): Rating => {
  if (answers.length === 0) return 'noData';
  if (answers.length < fewestAnswersToJudge) return 'shaky';
  const share = answers.filter(answer => answer === 1).length / answers.length;
  if (share < weakBelowShare) return 'weak';
  return share >= solidFromShare ? 'solid' : 'shaky';
};

const isInScope = (modeVariant: string, { mode, variant }: StatsScope) => {
  const [recordedMode, recordedVariant] = modeVariant.split(':');
  return regularModes.includes(recordedMode as Mode) && (!mode || recordedMode === mode) && (!variant || recordedVariant === variant);
};

const readPlaceRecords = (storage: KeyValueStorage): PlaceRecords => {
  try {
    const stored: unknown = JSON.parse(storage.getItem(placesStorageKey) ?? 'null');
    if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) return stored as PlaceRecords;
  }
  catch {
    // A damaged entry is treated as empty.
  }
  return {};
};

export const createStats = ({ places, storage }: StatsDependencies) => {
  const records = createRecords(storage);

  const placeRatings = (scope: StatsScope = {}): PlaceRatings => {
    const tier = deepestTierPlayed(storage);
    const pooledAnswers = new Map<string, number[]>();
    for (const [modeVariant, byPlaceId] of Object.entries(readPlaceRecords(storage))) {
      if (!isInScope(modeVariant, scope)) continue;
      for (const [placeId, { recent }] of Object.entries(byPlaceId)) pooledAnswers.set(placeId, [...pooledAnswers.get(placeId) ?? [], ...recent]);
    }
    return Object.fromEntries(places
      .filter(place => tiersInOrder.indexOf(place.tier) <= tiersInOrder.indexOf(tier))
      .map(({ id }) => [id, ratingOf(pooledAnswers.get(id) ?? [])]));
  };

  const allGames = (): AllGamesStats => {
    const ratings = placeRatings();
    const countOf = (rating: Rating) => Object.values(ratings).filter(placeRating => placeRating === rating).length;
    return {
      tier: deepestTierPlayed(storage),
      roundsPlayed: records.roundLog().filter(({ mode }) => regularModes.includes(mode)).length,
      placesSolid: countOf('solid'),
      placesWeak: countOf('weak'),
      placeRatings: ratings,
    };
  };

  return { placeRatings, allGames };
};

export type Stats = ReturnType<typeof createStats>;
