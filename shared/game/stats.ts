import { deepestTierPlayed } from './game';
import type { KeyValueStorage, Mode, Place, Region, Tier, Variant } from './game';
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

export interface RegionCounts {
  region: Region
  weak: number
  shaky: number
  solid: number
  unplayed: number
}

export interface PlaceDetails {
  rating: Rating
  recent: { right: number, count: number }
  lifetime: { right: number, total: number }
  easy: { right: number, total: number }
  confusedWith?: string
}

export interface StatsDependencies {
  places: readonly Place[]
  storage: KeyValueStorage
}

const placesStorageKey = 'ti:places';
const regularModes: Mode[] = ['find', 'name', 'capital', 'country'];
const regionsInOrder: Region[] = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
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

  const regionCounts = (scope: StatsScope = {}): RegionCounts[] => {
    const ratings = placeRatings(scope);
    return regionsInOrder
      .map((region) => {
        const regionRatings = places.filter(place => place.region === region && place.id in ratings).map(({ id }) => ratings[id]);
        const countOf = (rating: Rating) => regionRatings.filter(placeRating => placeRating === rating).length;
        return { region, weak: countOf('weak'), shaky: countOf('shaky'), solid: countOf('solid'), unplayed: countOf('noData') };
      })
      .sort((first, second) => second.weak - first.weak || second.shaky - first.shaky || second.unplayed - first.unplayed);
  };

  const placeDetails = (placeId: string, scope: StatsScope = {}): PlaceDetails => {
    const details: PlaceDetails = { rating: 'noData', recent: { right: 0, count: 0 }, lifetime: { right: 0, total: 0 }, easy: { right: 0, total: 0 } };
    const recent: number[] = [];
    for (const [modeVariant, byPlaceId] of Object.entries(readPlaceRecords(storage))) {
      const record = byPlaceId[placeId];
      if (!record || !isInScope(modeVariant, scope)) continue;
      recent.push(...record.recent);
      details.lifetime.right += record.correct;
      details.lifetime.total += record.seen;
      details.easy.right += record.easyCorrect;
      details.easy.total += record.easySeen;
      if (record.confusedWith) details.confusedWith = record.confusedWith;
    }
    return { ...details, rating: ratingOf(recent), recent: { right: recent.filter(answer => answer === 1).length, count: recent.length } };
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

  return { placeRatings, regionCounts, placeDetails, allGames };
};

export type Stats = ReturnType<typeof createStats>;
