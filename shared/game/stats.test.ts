import { describe, expect, it } from 'vitest';
import shippedNames from '../../public/data/names.json';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame, isTypedMode } from './game';
import type { Game, KeyValueStorage, Place, RoundSetup } from './game';
import type { NamesFile, PlaceNames } from './matcher';
import type { RoundSummary } from './records';
import { createStats } from './stats';
import type { Rating } from './stats';

const fiveOceaniaPlaceIds = ['AUS', 'NZL', 'FJI', 'PNG', 'WSM'];
const places = (shippedPlaces as Place[]).filter(({ id, region, tier }) => region !== 'Oceania' || tier !== 'sovereign' || fiveOceaniaPlaceIds.includes(id));
const names = shippedNames as NamesFile;
const sovereignIds = places.filter(({ tier }) => tier === 'sovereign').map(({ id }) => id);
const right = '✓';

const seededRandom = (seed: number) => {
  let current = seed;
  return () => {
    current = (current + 0x6d2b79f5) | 0;
    let mixed = Math.imul(current ^ (current >>> 15), 1 | current);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const memoryStorage = (): KeyValueStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
};

const statsGame = () => {
  const storage = memoryStorage();
  let now = Date.UTC(2026, 10, 18, 9);
  const game = createGame({ places, names, version: shippedVersion, random: seededRandom(3), clock: () => now, storage });
  const wait = (ms: number) => {
    now += ms;
  };
  return { game, stats: createStats({ places, storage }), storage, wait };
};

const oceaniaRound: RoundSetup = { mode: 'find', variant: 'flag', region: 'Oceania', tier: 'sovereign', deckSize: 'all', easy: false, timed: false };

const answerPrompt = (game: Game, placeId: string, isRight: boolean) => {
  if (game.state.phase === 'prompt' && isTypedMode(game.state.setup.mode)) {
    game.send(isRight ? { type: 'submit', text: (names[placeId] as PlaceNames).en.name } : { type: 'dontKnow' });
    return;
  }
  if (isRight) game.send({ type: 'tap', placeId });
  while (game.state.phase === 'prompt') game.send({ type: 'tap', placeId: 'DEU' });
};

const playRounds = (game: Game, setup: Partial<RoundSetup>, answersByPlace: Record<string, string>) => {
  const roundSetup = { ...oceaniaRound, ...setup };
  const roundCount = Math.max(0, ...Object.values(answersByPlace).map(({ length }) => length));
  for (let round = 0; round < roundCount; round += 1) {
    game.send({ type: 'start', setup: roundSetup });
    while (game.state.phase === 'prompt') {
      const { placeId } = game.state;
      answerPrompt(game, placeId, (answersByPlace[placeId]?.[round] ?? right) === right);
      game.send({ type: 'next' });
    }
    game.send({ type: 'leave' });
  }
};

const endRoundAtOnce = (game: Game) => {
  game.send({ type: 'askEnd' });
  game.send({ type: 'end' });
  game.send({ type: 'leave' });
};

describe('rating', () => {
  it('is no data for every place of the tier before any answer', () => {
    const { stats } = statsGame();

    const ratings = stats.placeRatings();

    expect(Object.keys(ratings)).toEqual(sovereignIds);
    expect(new Set(Object.values(ratings))).toEqual(new Set(['noData']));
  });

  it.each<{ answers: string, rating: Rating }>([
    { answers: '✗', rating: 'shaky' },
    { answers: '✓', rating: 'shaky' },
    { answers: '✗✗', rating: 'shaky' },
    { answers: '✓✓', rating: 'shaky' },
    { answers: '✗✗✗', rating: 'weak' },
    { answers: '✓✗✗', rating: 'weak' },
    { answers: '✓✓✓✗✗✗✗', rating: 'weak' },
    { answers: '✓✓✗✗', rating: 'shaky' },
    { answers: '✓✓✓✗', rating: 'shaky' },
    { answers: '✓✓✓✓✗', rating: 'solid' },
    { answers: '✓✓✓', rating: 'solid' },
  ])('rates $answers as $rating', ({ answers, rating }) => {
    const { game, stats } = statsGame();

    playRounds(game, {}, { AUS: answers });

    expect(stats.placeRatings().AUS).toBe(rating);
  });

  it('judges the last 8 normal answers of each mode-variant, not every answer', () => {
    const { game, stats } = statsGame();

    playRounds(game, {}, { AUS: '✗✗✗✓✓✓✓✓✓✓✓', NZL: '✓✓✓✓✓✓✗✗✗✗✗' });

    expect(stats.placeRatings()).toMatchObject({ AUS: 'solid', NZL: 'weak' });
  });

  it('never moves on Easy-mode answers', () => {
    const { game, stats } = statsGame();

    playRounds(game, {}, { AUS: '✓✓✓', NZL: '✗✗✗' });
    playRounds(game, { easy: true }, { AUS: '✗✗✗✗', NZL: '✓✓✓✓' });
    playRounds(game, { variant: 'name', easy: true }, { AUS: '✓✓✓' });

    expect(stats.placeRatings()).toMatchObject({ AUS: 'solid', NZL: 'weak' });
    expect(stats.placeRatings({ mode: 'find', variant: 'name' })).toMatchObject({ AUS: 'noData', NZL: 'noData' });
  });

  it('pools the recent answers of every mode-variant in scope', () => {
    const { game, stats } = statsGame();

    playRounds(game, { variant: 'flag' }, { AUS: '✓', NZL: '✗', FJI: '✓' });
    playRounds(game, { variant: 'name' }, { AUS: '✓', NZL: '✗', FJI: '✓' });
    playRounds(game, { mode: 'country', variant: 'flag' }, { AUS: '✓', NZL: '✓', FJI: '✗' });

    expect(stats.placeRatings()).toMatchObject({ AUS: 'solid', NZL: 'weak', FJI: 'shaky' });
    expect(stats.placeRatings({ mode: 'find' })).toMatchObject({ AUS: 'shaky', NZL: 'shaky', FJI: 'shaky' });
    expect(stats.placeRatings({ mode: 'find', variant: 'flag' })).toMatchObject({ AUS: 'shaky', NZL: 'shaky', FJI: 'shaky' });
    expect(stats.placeRatings({ mode: 'name' })).toMatchObject({ AUS: 'noData', NZL: 'noData', FJI: 'noData' });
  });

  it('pools more than 8 answers when several mode-variants are in scope', () => {
    const { game, stats } = statsGame();

    playRounds(game, { variant: 'flag' }, { FJI: '✓✓✓✓✓✓✓✓' });
    playRounds(game, { variant: 'name' }, { FJI: '✗✗✗✗✗✗✗✗' });

    expect(stats.placeRatings({ mode: 'find', variant: 'flag' }).FJI).toBe('solid');
    expect(stats.placeRatings({ mode: 'find', variant: 'name' }).FJI).toBe('weak');
    expect(stats.placeRatings().FJI).toBe('shaky');
  });

  it('covers the places of the deepest tier played so far', () => {
    const { game, stats } = statsGame();
    playRounds(game, {}, { AUS: '✓✓✓' });
    expect(Object.keys(stats.placeRatings())).toEqual(sovereignIds);

    game.send({ type: 'start', setup: { ...oceaniaRound, region: 'Europe', tier: 'dependencies' } });
    endRoundAtOnce(game);
    playRounds(game, {}, { AUS: '✓' });

    expect(Object.keys(stats.placeRatings())).toEqual(places.map(({ id }) => id));
    expect(stats.placeRatings()).toMatchObject({ AUS: 'solid', GRL: 'noData' });
  });
});

describe('all games', () => {
  it('starts empty: no rounds, no solid or weak places, every place no data', () => {
    const { stats } = statsGame();

    const allGames = stats.allGames();

    expect(allGames).toMatchObject({ tier: 'sovereign', roundsPlayed: 0, placesSolid: 0, placesWeak: 0 });
    expect(new Set(Object.values(allGames.placeRatings))).toEqual(new Set(['noData']));
  });

  it('counts every round played, ended early and daily included, and the places solid and weak over the tier', () => {
    const { game, stats } = statsGame();

    playRounds(game, {}, { AUS: '✓✓✓', NZL: '✗✗✗', FJI: '✓✗✗', PNG: '✓✓✗', WSM: '✓✓✓' });
    game.send({ type: 'start', setup: { ...oceaniaRound, region: 'Europe', tier: 'defacto' } });
    endRoundAtOnce(game);
    game.send({ type: 'startDaily', variant: 'name' });
    endRoundAtOnce(game);

    expect(stats.allGames()).toMatchObject({ tier: 'defacto', roundsPlayed: 5, placesSolid: 2, placesWeak: 2 });
  });
});

describe('region counts', () => {
  const unplayedIn = (region: string) => places.filter(place => place.region === region && place.tier === 'sovereign').length;

  it('lists the six regions, all unplayed before any answer, the biggest first', () => {
    const { stats } = statsGame();

    const counts = stats.regionCounts();

    expect(counts).toHaveLength(6);
    expect(counts.every(({ weak, shaky, solid }) => weak + shaky + solid === 0)).toBe(true);
    expect(counts.map(({ unplayed }) => unplayed)).toEqual(counts.map(({ region }) => unplayedIn(region)).sort((first, second) => second - first));
  });

  it('counts weak, shaky, solid and unplayed places per region', () => {
    const { game, stats } = statsGame();

    playRounds(game, {}, { AUS: '✓✓✓', NZL: '✗✗✗', FJI: '✗✗✗', PNG: '✓✗', WSM: '✓✓✓' });

    expect(stats.regionCounts().find(({ region }) => region === 'Oceania')).toEqual({ region: 'Oceania', weak: 2, shaky: 1, solid: 2, unplayed: 0 });
  });

  it('sorts by weak count, then shaky, then unplayed, highest first', () => {
    const { game, stats } = statsGame();
    playRounds(game, {}, { AUS: '✗✗✗', NZL: '✗✗✗', FJI: '✓✗' });
    playRounds(game, { region: 'Europe' }, { FRA: '✗✗✗', ESP: '✓✗', ITA: '✓✗' });

    expect(stats.regionCounts().slice(0, 2)).toMatchObject([{ region: 'Oceania', weak: 2 }, { region: 'Europe', weak: 1, shaky: 2 }]);

    playRounds(game, { region: 'Asia' }, { JPN: '✗✗✗', CHN: '✗✗✗', IND: '✓✗' });
    playRounds(game, { region: 'Africa' }, { EGY: '✗✗✗', NGA: '✗✗✗', KEN: '✓✗' });

    expect(stats.regionCounts().slice(0, 4)).toMatchObject([{ region: 'Africa', weak: 2, shaky: 1 }, { region: 'Asia', weak: 2, shaky: 1 }, { region: 'Oceania', weak: 2, shaky: 1 }, { region: 'Europe', weak: 1 }]);
  });

  it('follows the scope and the deepest tier played so far', () => {
    const { game, stats } = statsGame();
    playRounds(game, { variant: 'name' }, { AUS: '✗✗✗' });

    expect(stats.regionCounts({ mode: 'find', variant: 'flag' })[0]!.weak).toBe(0);
    expect(stats.regionCounts({ mode: 'find', variant: 'name' })[0]).toMatchObject({ region: 'Oceania', weak: 1 });

    game.send({ type: 'start', setup: { ...oceaniaRound, region: 'Europe', tier: 'dependencies' } });
    endRoundAtOnce(game);

    const total = stats.regionCounts().reduce((sum, { weak, shaky, solid, unplayed }) => sum + weak + shaky + solid + unplayed, 0);
    expect(total).toBe(places.length);
  });
});

describe('place details', () => {
  it('has no rating and zero numbers for a place never asked', () => {
    const { stats } = statsGame();

    expect(stats.placeDetails('AUS')).toEqual({ rating: 'noData', recent: { right: 0, count: 0 }, lifetime: { right: 0, total: 0 }, easy: { right: 0, total: 0 } });
  });

  it('pools recent answers and lifetime numbers over the scope, keeping Easy mode apart', () => {
    const { game, stats } = statsGame();

    playRounds(game, { variant: 'flag' }, { AUS: '✓✓✗✓' });
    playRounds(game, { variant: 'name' }, { AUS: '✗✓' });
    playRounds(game, { easy: true }, { AUS: '✓✓✗' });

    expect(stats.placeDetails('AUS')).toMatchObject({ rating: 'shaky', recent: { right: 4, count: 6 }, lifetime: { right: 4, total: 6 }, easy: { right: 2, total: 3 } });
    expect(stats.placeDetails('AUS', { mode: 'find', variant: 'name' })).toMatchObject({ recent: { right: 1, count: 2 }, lifetime: { right: 1, total: 2 } });
  });

  it('keeps lifetime numbers beyond the last 8 answers', () => {
    const { game, stats } = statsGame();

    playRounds(game, {}, { AUS: '✗✗✗✗✓✓✓✓✓✓✓✓' });

    expect(stats.placeDetails('AUS')).toMatchObject({ rating: 'solid', recent: { right: 8, count: 8 }, lifetime: { right: 8, total: 12 } });
  });

  it('names the place it was recently confused with', () => {
    const { game, stats } = statsGame();
    game.send({ type: 'start', setup: oceaniaRound });
    const { placeId } = game.state as { placeId: string };
    game.send({ type: 'tap', placeId: placeId === 'AUS' ? 'NZL' : 'AUS' });

    expect(stats.placeDetails(placeId).confusedWith).toBe(placeId === 'AUS' ? 'NZL' : 'AUS');
  });
});

describe('mode stats', () => {
  const allOceaniaWrongOnce = (rest: string) => Object.fromEntries(fiveOceaniaPlaceIds.map(placeId => [placeId, `✗${placeId === 'AUS' ? rest : right.repeat(rest.length)}`]));

  it('starts empty', () => {
    const { stats } = statsGame();

    expect(stats.modeStats({ mode: 'find' })).toEqual({ completeRounds: 0, averageShare: null, perfectRounds: 0, bests: [], lastRounds: [] });
  });

  it('counts complete rounds only and lists the last 10 rounds newest first, ended early included', () => {
    const { game, stats } = statsGame();

    playRounds(game, {}, { AUS: '✓✓✓✓✓✓✓✓✓✓✗' });
    game.send({ type: 'start', setup: oceaniaRound });
    endRoundAtOnce(game);

    const { completeRounds, perfectRounds, lastRounds } = stats.modeStats({ mode: 'find' });
    expect({ completeRounds, perfectRounds }).toEqual({ completeRounds: 11, perfectRounds: 10 });
    expect(lastRounds.map(({ score, complete }) => `${score}${complete ? '' : ' ended'}`)).toEqual(['0 ended', '4', '5', '5', '5', '5', '5', '5', '5', '5']);
  });

  it('averages the share of each complete round over the last 20 complete rounds', () => {
    const { game, stats } = statsGame();

    playRounds(game, {}, allOceaniaWrongOnce('✓✗'.repeat(10)));
    game.send({ type: 'start', setup: oceaniaRound });
    endRoundAtOnce(game);

    const { completeRounds, averageShare, perfectRounds } = stats.modeStats({ mode: 'find' });
    expect({ completeRounds, perfectRounds }).toEqual({ completeRounds: 21, perfectRounds: 10 });
    expect(averageShare).toBeCloseTo(0.9, 10);
  });

  it('follows the mode and the variant filter', () => {
    const { game, stats } = statsGame();

    playRounds(game, { variant: 'flag' }, { AUS: '✓✓' });
    playRounds(game, { variant: 'name' }, { AUS: '✗' });
    playRounds(game, { mode: 'country', variant: 'flag' }, { AUS: '✗✗✗' });

    expect(stats.modeStats({ mode: 'find' })).toMatchObject({ completeRounds: 3, perfectRounds: 2 });
    expect(stats.modeStats({ mode: 'find', variant: 'name' })).toMatchObject({ completeRounds: 1, averageShare: 0.8, perfectRounds: 0 });
    expect(stats.modeStats({ mode: 'country', variant: 'silhouette' }).completeRounds).toBe(0);
    expect(stats.modeStats({ mode: 'country' }).lastRounds.map(({ variant }) => variant)).toEqual(['flag', 'flag', 'flag']);
    expect(stats.modeStats({ mode: 'name' }).completeRounds).toBe(0);
  });

  it('shows the stored personal bests of the 5 most-played setups, ended-early rounds counted as plays', () => {
    const { game, stats, wait } = statsGame();
    const playTaking = (setup: Partial<RoundSetup>, takingMs: number, { missesFirst = false } = {}) => {
      game.send({ type: 'start', setup: { ...oceaniaRound, ...setup } });
      wait(takingMs);
      while (game.state.phase === 'prompt') {
        answerPrompt(game, game.state.placeId, !missesFirst || game.state.promptNumber > 1);
        game.send({ type: 'next' });
      }
      game.send({ type: 'leave' });
    };

    playTaking({}, 40_000);
    playTaking({}, 30_000);
    playTaking({}, 10_000, { missesFirst: true });
    game.send({ type: 'start', setup: oceaniaRound });
    endRoundAtOnce(game);
    playTaking({ variant: 'name' }, 20_000, { missesFirst: true });
    playTaking({ variant: 'name' }, 20_000, { missesFirst: true });
    playTaking({ variant: 'name' }, 20_000, { missesFirst: true });
    playTaking({ region: 'Europe', deckSize: 10 }, 50_000);
    playTaking({ region: 'Europe', deckSize: 10 }, 45_000, { missesFirst: true });
    playTaking({ variant: 'both' }, 25_000);
    playTaking({ variant: 'both' }, 15_000, { missesFirst: true });
    playTaking({ easy: true }, 5_000);
    playTaking({ region: 'Africa', deckSize: 10 }, 60_000);

    const oceania = { region: 'Oceania', tier: 'sovereign', easy: false, deckSize: 5 };
    expect(stats.modeStats({ mode: 'find' }).bests).toEqual([
      { ...oceania, variant: 'flag', plays: 4, score: 5, fastestPerfectMs: 30_000 },
      { ...oceania, variant: 'name', plays: 3, score: 4, fastestPerfectMs: null },
      { ...oceania, variant: 'both', plays: 2, score: 5, fastestPerfectMs: 25_000 },
      { variant: 'flag', region: 'Europe', tier: 'sovereign', easy: false, deckSize: 10, plays: 2, score: 10, fastestPerfectMs: 50_000 },
      { variant: 'flag', region: 'Africa', tier: 'sovereign', easy: false, deckSize: 10, plays: 1, score: 10, fastestPerfectMs: 60_000 },
    ]);
    expect(stats.modeStats({ mode: 'find', variant: 'flag' }).bests.map(({ region, easy }) => `${region}${easy ? ' easy' : ''}`)).toEqual(['Oceania', 'Europe', 'Africa', 'Oceania easy']);
  });

  it('treats a 10-place and an All deck of the same small pool as one setup', () => {
    const { game, stats } = statsGame();

    playRounds(game, { deckSize: 10 }, { AUS: '✗' });
    playRounds(game, { deckSize: 'all' }, { AUS: '✓' });

    expect(stats.modeStats({ mode: 'find' }).bests).toMatchObject([{ region: 'Oceania', deckSize: 5, plays: 2, score: 4 }]);
  });

  it('leaves learning rounds out of the tiles and bests and lists them with the last rounds', () => {
    const { game, stats, storage } = statsGame();
    playRounds(game, {}, { AUS: '✗' });
    const [logged] = JSON.parse(storage.getItem('ti:rounds')!) as RoundSummary[];

    storage.setItem('ti:rounds', JSON.stringify([logged, { ...logged, learn: true, score: 5 }]));

    const modeStats = stats.modeStats({ mode: 'find' });
    expect(modeStats).toMatchObject({ completeRounds: 1, averageShare: 0.8, perfectRounds: 0 });
    expect(modeStats.bests).toMatchObject([{ plays: 1, score: 4 }]);
    expect(modeStats.lastRounds.map(({ learn }) => learn)).toEqual([true, false]);
    expect(stats.allGames().roundsPlayed).toBe(2);
  });
});
