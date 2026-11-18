import { describe, expect, it } from 'vitest';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame } from './game';
import type { GameState, KeyValueStorage, Place, RoundSetup, Tier } from './game';

const places = shippedPlaces as Place[];
const microstateIds = (tier: Tier) => places.filter(({ microstate }) => microstate?.[tier]).map(({ id }) => id);
const tierIds = (tier: Tier) => {
  const tiers: Tier[] = ['sovereign', 'defacto', 'dependencies'];
  return places.filter(place => tiers.indexOf(place.tier) <= tiers.indexOf(tier)).map(({ id }) => id);
};

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

const storedJson = (storage: KeyValueStorage, key: string) => JSON.parse(storage.getItem(key) ?? 'null');

const missingRound = (changes: Partial<RoundSetup> = {}, { seed = 1, storage = memoryStorage(), now = Date.UTC(2026, 10, 18) } = {}) => {
  let clockNow = now;
  const game = createGame({ places, version: shippedVersion, random: seededRandom(seed), clock: () => clockNow, storage });
  const setup: RoundSetup = { ...game.setupFor('missing'), ...changes };
  game.send({ type: 'start', setup });
  const waitAndTick = (ms: number) => {
    clockNow += ms;
    game.send({ type: 'tick' });
  };
  return { game, storage, setup, waitAndTick };
};

const roundOf = (game: ReturnType<typeof missingRound>['game']) => {
  const { state } = game;
  if (state.phase !== 'missing') throw new Error(`expected a What's missing round, got ${state.phase}`);
  return state;
};

const resultsOf = (game: ReturnType<typeof missingRound>['game']) => {
  const { state } = game;
  if (state.phase !== 'results') throw new Error(`expected results, got ${state.phase}`);
  return state;
};

const landNotInGaps = (state: Extract<GameState, { phase: 'missing' }>) => tierIds(state.setup.tier).filter(id => !state.gapPlaceIds.includes(id));

describe('What\'s missing setup', () => {
  it('is timed, world-only and sovereign on first launch, with Easy mode off', () => {
    const game = createGame({ places, version: shippedVersion, random: seededRandom(1), clock: () => 0, storage: memoryStorage() });

    expect(game.setupFor('missing')).toEqual({ mode: 'missing', variant: 'map', region: 'world', tier: 'sovereign', deckSize: 10, easy: false, timed: true });
  });

  it('offers every tier and plays ten gaps', () => {
    const game = createGame({ places, version: shippedVersion, random: seededRandom(1), clock: () => 0, storage: memoryStorage() });
    const choices = game.choicesFor(game.setupFor('missing'));

    expect(choices.tiers.map(({ value, isAvailable }) => [value, isAvailable])).toEqual([['sovereign', true], ['defacto', true], ['dependencies', true]]);
    expect(choices.playCount).toBe(10);
  });

  it('refuses a region other than the whole world', () => {
    const { game } = missingRound({ region: 'Europe' });

    expect(game.state.phase).toBe('home');
  });

  it('remembers its own last setup', () => {
    const storage = memoryStorage();
    missingRound({ tier: 'defacto', timed: false, easy: true }, { storage });
    const game = createGame({ places, version: shippedVersion, random: seededRandom(1), clock: () => 0, storage });

    expect(game.setupFor('missing')).toMatchObject({ tier: 'defacto', timed: false, easy: true });
  });
});

describe('What\'s missing gaps', () => {
  it('are always ten, in every tier', () => {
    for (const tier of ['sovereign', 'defacto', 'dependencies'] as Tier[]) {
      const { game } = missingRound({ tier });

      expect(new Set(roundOf(game).gapPlaceIds).size).toBe(10);
    }
  });

  it('come from the tier\'s places and never from a microstate, across many draws', () => {
    for (const tier of ['sovereign', 'defacto', 'dependencies'] as Tier[]) {
      const eligible = tierIds(tier).filter(id => !microstateIds(tier).includes(id));
      for (let seed = 1; seed <= 40; seed += 1) {
        const { gapPlaceIds } = roundOf(missingRound({ tier }, { seed }).game);

        expect(gapPlaceIds.every(id => eligible.includes(id))).toBe(true);
      }
    }
  });

  it('leave the shipped microstates out of the pool, and keep a pool big enough to draw from', () => {
    const { game } = missingRound();
    const pool = game.poolOf({ ...game.setupFor('missing') });

    expect(microstateIds('sovereign').length).toBeGreaterThan(0);
    expect(pool.some(id => microstateIds('sovereign').includes(id))).toBe(false);
    expect(pool.length).toBeGreaterThan(100);
  });

  it('may touch each other', () => {
    const neighbours = new Map(places.map(({ id, neighbours: borders }: Place & { neighbours?: Record<Tier, string[]> }) => [id, borders?.sovereign ?? []]));
    const hasNeighbouringGaps = Array.from({ length: 200 }, (_, index) => roundOf(missingRound({}, { seed: index + 1 }).game).gapPlaceIds)
      .some(gaps => gaps.some(id => neighbours.get(id)!.some(other => gaps.includes(other))));

    expect(hasNeighbouringGaps).toBe(true);
  });

  it('differ between rounds', () => {
    expect(roundOf(missingRound({}, { seed: 1 }).game).gapPlaceIds).not.toEqual(roundOf(missingRound({}, { seed: 2 }).game).gapPlaceIds);
  });
});

describe('What\'s missing taps', () => {
  it('give 10 taps, and 30 in Easy mode', () => {
    expect(roundOf(missingRound().game).tapsLeft).toBe(10);
    expect(roundOf(missingRound({ easy: true }).game).tapsLeft).toBe(30);
  });

  it('count a hit as found and spend a tap', () => {
    const { game } = missingRound();
    const [gap] = roundOf(game).gapPlaceIds;
    game.send({ type: 'tap', placeId: gap });

    expect(roundOf(game)).toMatchObject({ foundPlaceIds: [gap], tapsLeft: 9, lastTap: { kind: 'hit', placeId: gap } });
  });

  it('count a tap on the sea as a miss', () => {
    const { game } = missingRound();
    game.send({ type: 'tap' });

    expect(roundOf(game)).toMatchObject({ foundPlaceIds: [], tapsLeft: 9, lastTap: { kind: 'sea' } });
  });

  it('count a tap on the wrong land as a miss that names the place tapped', () => {
    const { game } = missingRound();
    const [wrongPlaceId] = landNotInGaps(roundOf(game));
    game.send({ type: 'tap', placeId: wrongPlaceId });

    expect(roundOf(game)).toMatchObject({ foundPlaceIds: [], tapsLeft: 9, lastTap: { kind: 'wrong', placeId: wrongPlaceId } });
  });

  it('ignore a second tap on a gap already found', () => {
    const { game } = missingRound();
    const [gap] = roundOf(game).gapPlaceIds;
    game.send({ type: 'tap', placeId: gap });
    game.send({ type: 'tap', placeId: gap });

    expect(roundOf(game)).toMatchObject({ foundPlaceIds: [gap], tapsLeft: 9 });
  });

  it('give a score of found out of ten', () => {
    const { game } = missingRound();
    const { gapPlaceIds } = roundOf(game);
    for (const gap of gapPlaceIds.slice(0, 4)) game.send({ type: 'tap', placeId: gap });
    for (let miss = 0; miss < 6; miss += 1) game.send({ type: 'tap' });

    expect(resultsOf(game)).toMatchObject({ score: 4, deckSize: 10 });
  });

  it('are 30 in Easy mode before the budget is spent', () => {
    const { game } = missingRound({ easy: true });
    for (let miss = 0; miss < 29; miss += 1) game.send({ type: 'tap' });

    expect(roundOf(game).tapsLeft).toBe(1);

    game.send({ type: 'tap' });

    expect(resultsOf(game)).toMatchObject({ score: 0, isComplete: true });
  });
});

describe('What\'s missing endings', () => {
  it('end complete when all ten are found, with a perfect score', () => {
    const { game, storage } = missingRound();
    for (const gap of roundOf(game).gapPlaceIds) game.send({ type: 'tap', placeId: gap });

    expect(resultsOf(game)).toMatchObject({ score: 10, isComplete: true, missedPlaceIds: [], isNewBest: true });
    expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ mode: 'missing', variant: 'map', region: 'world', score: 10, deckSize: 10, complete: true, timed: true })]);
  });

  it('end complete when the taps are spent', () => {
    const { game, storage } = missingRound();
    for (let miss = 0; miss < 10; miss += 1) game.send({ type: 'tap' });

    expect(resultsOf(game)).toMatchObject({ score: 0, isComplete: true });
    expect(resultsOf(game).missedPlaceIds).toHaveLength(10);
    expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ complete: true, score: 0 })]);
  });

  it('end complete on the clock after 90 seconds when timed', () => {
    const { game, waitAndTick } = missingRound();
    const [gap] = roundOf(game).gapPlaceIds;
    game.send({ type: 'tap', placeId: gap });

    waitAndTick(89_750);
    expect(roundOf(game).foundPlaceIds).toEqual([gap]);
    expect(game.timeLeftMs()).toBe(250);

    waitAndTick(250);
    expect(resultsOf(game)).toMatchObject({ score: 1, isComplete: true, elapsedMs: 90_000 });
    expect(game.timeLeftMs()).toBeNull();
  });

  it('has no clock when untimed, and no time limit however long it takes', () => {
    const { game, waitAndTick } = missingRound({ timed: false });

    expect(game.timeLeftMs()).toBeNull();

    waitAndTick(3_600_000);
    expect(roundOf(game).tapsLeft).toBe(10);
  });

  it('end incomplete only on End round, keeping the score so far', () => {
    const { game, storage } = missingRound();
    const [gap] = roundOf(game).gapPlaceIds;
    game.send({ type: 'tap', placeId: gap });
    game.send({ type: 'askEnd' });
    game.send({ type: 'end' });

    expect(resultsOf(game)).toMatchObject({ score: 1, isComplete: false, isNewBest: false });
    expect(resultsOf(game).missedPlaceIds).toHaveLength(9);
    expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ complete: false, score: 1 })]);
    expect(storedJson(storage, 'ti:bests')).toBeNull();
  });

  it('use the shared pauses of a timed round and stop the clock while paused', () => {
    const { game, waitAndTick } = missingRound();
    game.send({ type: 'pause' });

    expect(roundOf(game)).toMatchObject({ isPaused: true, pausesLeft: 2 });

    waitAndTick(60_000);
    game.send({ type: 'resume' });

    expect(game.timeLeftMs()).toBe(90_000);
  });
});

describe('What\'s missing personal bests', () => {
  const bestKeys = (storage: KeyValueStorage) => Object.keys(storedJson(storage, 'ti:bests')).sort();

  it('are kept apart for timed and untimed rounds', () => {
    const storage = memoryStorage();
    for (const timed of [true, false]) {
      const { game } = missingRound({ timed }, { storage });
      for (const gap of roundOf(game).gapPlaceIds) game.send({ type: 'tap', placeId: gap });
    }

    expect(bestKeys(storage)).toEqual(['missing:map:world:sovereign:10:normal:timed', 'missing:map:world:sovereign:10:normal:untimed']);
  });

  it('are kept apart for Easy mode and tier too', () => {
    const storage = memoryStorage();
    for (const changes of [{ easy: true }, { easy: false, tier: 'defacto' as Tier }]) {
      const { game } = missingRound(changes, { storage });
      for (const gap of roundOf(game).gapPlaceIds) game.send({ type: 'tap', placeId: gap });
    }

    expect(bestKeys(storage)).toEqual(['missing:map:world:defacto:10:normal:timed', 'missing:map:world:sovereign:10:easy:timed']);
  });

  it('beat the previous best and mark a new one', () => {
    const storage = memoryStorage();
    const play = (found: number) => {
      const { game } = missingRound({}, { storage, seed: 9 });
      for (const gap of roundOf(game).gapPlaceIds.slice(0, found)) game.send({ type: 'tap', placeId: gap });
      for (let miss = roundOf(game).tapsLeft; miss > 0; miss -= 1) game.send({ type: 'tap' });
      return resultsOf(game);
    };

    expect(play(3).isNewBest).toBe(true);
    expect(play(2).isNewBest).toBe(false);
    expect(play(5).isNewBest).toBe(true);
    expect(storedJson(storage, 'ti:bests')['missing:map:world:sovereign:10:normal:timed']).toEqual({ score: 5, fastestPerfectMs: null });
  });
});

describe('What\'s missing records', () => {
  it('write only the round summary and the best, no per-place records', () => {
    const { game, storage } = missingRound();
    const { gapPlaceIds } = roundOf(game);
    game.send({ type: 'tap', placeId: gapPlaceIds[0] });
    game.send({ type: 'tap', placeId: landNotInGaps(roundOf(game))[0] });
    for (const gap of gapPlaceIds.slice(1)) game.send({ type: 'tap', placeId: gap });

    expect(storage.getItem('ti:places')).toBeNull();
    expect(storedJson(storage, 'ti:rounds')).toHaveLength(1);
    expect(storedJson(storage, 'ti:bests')).not.toBeNull();
  });
});

describe('What\'s missing resume', () => {
  it('persists an interrupted round and picks it up on launch with its gaps, finds and taps', () => {
    const storage = memoryStorage();
    const { game, setup } = missingRound({ easy: true }, { storage });
    const { gapPlaceIds } = roundOf(game);
    game.send({ type: 'tap', placeId: gapPlaceIds[2] });
    game.send({ type: 'tap' });

    expect(storedJson(storage, 'ti:round')).toMatchObject({ deck: gapPlaceIds, foundPlaceIds: [gapPlaceIds[2]], tapsUsed: 2 });

    const relaunched = createGame({ places, version: shippedVersion, random: seededRandom(77), clock: () => Date.UTC(2026, 10, 18) + 5_000, storage });

    expect(relaunched.state).toMatchObject({ phase: 'missing', setup, gapPlaceIds, foundPlaceIds: [gapPlaceIds[2]], tapsLeft: 28 });

    relaunched.send({ type: 'resume' });
    relaunched.send({ type: 'tap', placeId: gapPlaceIds[0] });

    expect(roundOf(relaunched)).toMatchObject({ foundPlaceIds: [gapPlaceIds[2], gapPlaceIds[0]], tapsLeft: 27 });
  });

  it('ends a timed round that ran out while the app was closed, with no pauses left, as complete', () => {
    const storage = memoryStorage();
    const { game } = missingRound({}, { storage });
    game.send({ type: 'tap', placeId: roundOf(game).gapPlaceIds[0] });
    storage.setItem('ti:round', JSON.stringify({ ...storedJson(storage, 'ti:round'), pausesUsed: 3 }));

    const relaunched = createGame({ places, version: shippedVersion, random: seededRandom(77), clock: () => Date.UTC(2026, 10, 18) + 2_000_000, storage });

    expect(relaunched.state).toMatchObject({ phase: 'results', score: 1, isComplete: true });
    expect(storage.getItem('ti:round')).toBeNull();
  });

  it('drops a stored round whose progress does not fit', () => {
    const storage = memoryStorage();
    const { game } = missingRound({}, { storage });
    const stored = storedJson(storage, 'ti:round');
    storage.setItem('ti:round', JSON.stringify({ ...stored, foundPlaceIds: ['NOT-A-GAP'] }));

    expect(createGame({ places, version: shippedVersion, random: seededRandom(1), clock: () => 0, storage }).state.phase).toBe('home');
    expect(game.state.phase).toBe('missing');
  });

  it('leaves no stored round behind once finished', () => {
    const { game, storage } = missingRound();
    for (const gap of roundOf(game).gapPlaceIds) game.send({ type: 'tap', placeId: gap });

    expect(storage.getItem('ti:round')).toBeNull();
  });
});
