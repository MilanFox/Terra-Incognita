import { deepestTierPlayed } from './game';
import type { DeckSize, KeyValueStorage, Mode, Place, Region, RegionChoice, RoundSetup, Tier, Variant } from './game';
import { bestKeyOf, createRecords } from './records';
import type { PersonalBests, PlaceRecords, RoundSummary } from './records';

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

export interface ModeScope extends StatsScope {
  mode: Mode
}

export interface SetupBest {
  variant: Variant
  region: RegionChoice
  tier: Tier
  easy: boolean
  timed?: boolean
  deckSize: number
  plays: number
  score: number
  fastestPerfectMs: number | null
}

export interface ModeStats {
  completeRounds: number
  averageShare: number | null
  perfectRounds: number
  best: number | null
  averageRoutes: number | null
  fastestPerfectMs: number | null
  bests: SetupBest[]
  lastRounds: RoundSummary[]
}

export interface StatsDependencies {
  places: readonly Place[]
  storage: KeyValueStorage
}

const placesStorageKey = 'ti:places';
export const regularModes: Mode[] = ['find', 'name', 'capital', 'country'];
export const specialModes: Mode[] = ['fill', 'missing', 'wayfinder'];
const regionsInOrder: Region[] = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
const tiersInOrder: Tier[] = ['sovereign', 'defacto', 'dependencies'];
const fewestAnswersToJudge = 3;
const weakBelowShare = 0.5;
const solidFromShare = 0.8;
const averagedRoundCount = 20;
const shownBestCount = 5;
const lastRoundCount = 10;

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

const isPerfect = ({ score, deckSize }: RoundSummary) => score === deckSize;

// The log keeps how many places a round had, not the deck choice: up to 10 places, either choice can lie behind it.
const bestKeyOfRound = (round: RoundSummary, bests: PersonalBests) => {
  const keyWith = (deckSize: DeckSize) => bestKeyOf({ ...round, deckSize });
  const candidates = (round.deckSize > 10 ? ['all'] : [10, 'all']).map(deckSize => keyWith(deckSize as DeckSize));
  return candidates.find(key => key in bests) ?? candidates[0]!;
};

const wayfinderSetupOf = (easy: boolean): RoundSetup => ({ mode: 'wayfinder', variant: 'map', region: 'world', tier: 'sovereign', deckSize: 10, easy, timed: false });

// eslint-disable-next-line no-unused-vars
type RoundValue = (round: RoundSummary) => number;

const pickSetup = ({ mode, variant, region, tier, easy, deckSize, timed }: RoundSummary) => ({ variant, region, tier, easy, deckSize, ...(mode === 'missing' && { timed }) });

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

  const mostPlayedBests = (rounds: RoundSummary[]): SetupBest[] => {
    const bests = records.personalBests();
    const playsByKey = new Map<string, { latest: RoundSummary, plays: number }>();
    for (const round of rounds) {
      const key = bestKeyOfRound(round, bests);
      playsByKey.set(key, { latest: round, plays: (playsByKey.get(key)?.plays ?? 0) + 1 });
    }
    return [...playsByKey]
      .filter(([key]) => key in bests)
      .sort(([, first], [, second]) => second.plays - first.plays || second.latest.date - first.latest.date)
      .slice(0, shownBestCount)
      .map(([key, { latest, plays }]) => ({ ...pickSetup(latest), plays, ...bests[key]! }));
  };

  const wayfinderBests = (rounds: RoundSummary[]): SetupBest[] => {
    const bests = records.personalBests();
    return [false, true]
      .map((easy) => {
        const played = rounds.filter(round => round.easy === easy);
        const score = bests[bestKeyOf(wayfinderSetupOf(easy))]?.score ?? 0;
        return { easy, played, score };
      })
      .filter(({ played, score }) => played.length > 0 && score > 0)
      .sort((first, second) => second.played.length - first.played.length || second.played.at(-1)!.date - first.played.at(-1)!.date)
      .map(({ easy, played, score }) => ({ ...pickSetup(played.at(-1)!), easy, plays: played.length, score, fastestPerfectMs: null }));
  };

  const modeStats = ({ mode, variant }: ModeScope): ModeStats => {
    const rounds = records.roundLog().filter(round => round.mode === mode && (!variant || round.variant === variant));
    const withBests = rounds.filter(({ learn }) => !learn);
    const counted = withBests.filter(({ complete }) => complete);
    const averaged = counted.slice(-averagedRoundCount);
    const isWayfinder = mode === 'wayfinder';
    const averageOf = (valueOf: RoundValue) => averaged.length > 0 ? averaged.reduce((sum, round) => sum + valueOf(round), 0) / averaged.length : null;
    const fastestPerfects = Object.entries(records.personalBests()).filter(([key]) => key.startsWith(`${mode}:`)).flatMap(([, { fastestPerfectMs }]) => fastestPerfectMs === null ? [] : [fastestPerfectMs]);
    return {
      completeRounds: counted.length,
      averageShare: isWayfinder ? null : averageOf(({ score, deckSize }) => score / deckSize),
      perfectRounds: isWayfinder ? 0 : counted.filter(isPerfect).length,
      best: counted.length === 0 ? null : Math.max(...counted.map(({ score, deckSize }) => isWayfinder ? score : score / deckSize)),
      averageRoutes: isWayfinder ? averageOf(({ score }) => score) : null,
      fastestPerfectMs: isWayfinder || fastestPerfects.length === 0 ? null : Math.min(...fastestPerfects),
      bests: isWayfinder ? wayfinderBests(withBests) : mostPlayedBests(withBests),
      lastRounds: rounds.slice(-lastRoundCount).reverse(),
    };
  };

  return { placeRatings, regionCounts, placeDetails, allGames, modeStats };
};

export type Stats = ReturnType<typeof createStats>;
