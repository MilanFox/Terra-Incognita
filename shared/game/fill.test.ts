import { describe, expect, it } from 'vitest';
import shippedNames from '../../public/data/names.json';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame } from './game';
import type { GameState, KeyValueStorage, Place, RoundSetup } from './game';
import type { NamesFile, PlaceNames } from './matcher';

const places = shippedPlaces as Place[];
const names = shippedNames as NamesFile;

const memoryStorage = (): KeyValueStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
};

const nameOf = (placeId: string, language: 'en' | 'de' = 'en') => (names[placeId] as PlaceNames)[language].name;

const storedJson = (storage: KeyValueStorage, key: string) => JSON.parse(storage.getItem(key) ?? 'null');

const startOfDay = Date.UTC(2026, 10, 17);

const startFill = ({ changes = {}, storage = memoryStorage(), now = { current: startOfDay } }: { changes?: Partial<RoundSetup>, storage?: KeyValueStorage, now?: { current: number } } = {}) => {
  const game = createGame({ places, names, version: shippedVersion, random: Math.random, clock: () => now.current, storage });
  game.send({ type: 'start', setup: { ...game.setupFor('fill'), region: 'Oceania', ...changes } });
  return { game, storage, now };
};

const fillStateOf = (game: ReturnType<typeof startFill>['game']) => {
  const { state } = game;
  if (state.phase !== 'fill') throw new Error(`Expected a fill round, got ${state.phase}`);
  return state;
};

const resultsOf = (game: ReturnType<typeof startFill>['game']) => {
  const { state } = game;
  if (state.phase !== 'results') throw new Error(`Expected results, got ${state.phase}`);
  return state as Extract<GameState, { phase: 'results' }>;
};

const oceaniaIds = places.filter(({ region, tier }) => region === 'Oceania' && tier === 'sovereign').map(({ id }) => id);

const nameAll = (game: ReturnType<typeof startFill>['game'], placeIds: string[]) => {
  for (const placeId of placeIds) game.send({ type: 'submit', text: nameOf(placeId) });
};

describe('Fill the map setup', () => {
  it('is the whole world, sovereign tier, all places, untimed, with no variant choice', () => {
    const game = createGame({ places, names, version: shippedVersion, random: Math.random, clock: () => 0, storage: memoryStorage() });
    const setup = game.setupFor('fill');

    expect(setup).toEqual({ mode: 'fill', variant: 'map', region: 'world', tier: 'sovereign', deckSize: 'all', easy: false, timed: false });
    expect(game.choicesFor(setup).variants.map(({ value }) => value)).toEqual(['map']);
    expect(game.choicesFor(setup)).toMatchObject({ playCount: 197 });
  });

  it('draws its pool from the region and tier', () => {
    const game = createGame({ places, names, version: shippedVersion, random: Math.random, clock: () => 0, storage: memoryStorage() });

    expect(game.poolOf({ ...game.setupFor('fill'), region: 'Oceania' }).toSorted()).toEqual(oceaniaIds.toSorted());
    expect(game.poolOf({ ...game.setupFor('fill'), tier: 'dependencies' })).toHaveLength(places.length);
  });

  it('has no Easy mode: asking for it plays a normal round', () => {
    const { game } = startFill({ changes: { easy: true } });

    expect(fillStateOf(game).setup.easy).toBe(false);
  });

  it('is remembered apart from the other modes', () => {
    const { storage } = startFill({ changes: { region: 'Africa', timed: true } });
    const game = createGame({ places, names, version: shippedVersion, random: Math.random, clock: () => 0, storage });

    expect(game.setupFor('fill')).toMatchObject({ region: 'Africa', timed: true });
    expect(game.setupFor('find')).toMatchObject({ region: 'world', timed: false });
    expect(game.lastSetup()).toMatchObject({ mode: 'fill' });
  });
});

describe('Fill the map rules', () => {
  it('fills any place in any order, English or German, and scores filled out of the pool', () => {
    const { game } = startFill();
    const [first, second, third] = oceaniaIds;

    game.send({ type: 'submit', text: nameOf(third!) });
    game.send({ type: 'submit', text: nameOf(first!, 'de') });
    game.send({ type: 'submit', text: nameOf(second!) });

    expect(fillStateOf(game)).toMatchObject({ score: 3, deckSize: oceaniaIds.length, filledPlaceIds: [third, first, second], lastInput: { kind: 'filled', placeId: second } });
  });

  it('takes a small typo as the place', () => {
    const { game } = startFill({ changes: { region: 'Europe' } });

    game.send({ type: 'submit', text: 'Germanyy' });

    expect(fillStateOf(game)).toMatchObject({ score: 1, filledPlaceIds: ['DEU'] });
  });

  it('lets wrong, duplicate, outside and unresolved input go without penalty', () => {
    const { game, storage } = startFill();
    const [first] = oceaniaIds;
    game.send({ type: 'submit', text: nameOf(first!) });
    const countBefore = fillStateOf(game).inputCount;

    game.send({ type: 'submit', text: nameOf(first!) });
    expect(fillStateOf(game)).toMatchObject({ score: 1, lastInput: { kind: 'duplicate', placeId: first } });

    game.send({ type: 'submit', text: 'Germany' });
    expect(fillStateOf(game)).toMatchObject({ score: 1, lastInput: { kind: 'outside' } });

    game.send({ type: 'submit', text: 'atlantis' });
    expect(fillStateOf(game)).toMatchObject({ score: 1, lastInput: { kind: 'none' } });

    game.send({ type: 'submit', text: 'congo' });
    expect(fillStateOf(game)).toMatchObject({ score: 1, lastInput: { kind: 'ambiguous' } });

    expect(fillStateOf(game)).toMatchObject({ inputCount: countBefore + 4, filledPlaceIds: [first] });
    expect(storage.getItem('ti:rounds')).toBeNull();
  });

  it('ignores taps, picks and Next', () => {
    const { game } = startFill();
    const before = fillStateOf(game);

    game.send({ type: 'tap', placeId: oceaniaIds[0] });
    game.send({ type: 'pick', placeId: oceaniaIds[0]! });
    game.send({ type: 'next' });
    game.send({ type: 'dontKnow' });

    expect(game.state).toEqual(before);
  });

  it('ends complete when the last place is filled', () => {
    const { game } = startFill();

    nameAll(game, oceaniaIds);

    expect(resultsOf(game)).toMatchObject({ score: oceaniaIds.length, deckSize: oceaniaIds.length, isComplete: true, missedPlaceIds: [] });
  });

  it('ends when the player ends the round, with the unfilled places unreached', () => {
    const { game } = startFill();
    const [first] = oceaniaIds;
    game.send({ type: 'submit', text: nameOf(first!) });

    game.send({ type: 'askEnd' });
    expect(fillStateOf(game).isConfirmingEnd).toBe(true);
    game.send({ type: 'end' });

    const results = resultsOf(game);
    expect(results).toMatchObject({ score: 1, deckSize: oceaniaIds.length, isComplete: false });
    expect(results.missedPlaceIds.toSorted()).toEqual(oceaniaIds.filter(id => id !== first).toSorted());
  });

  it('ends on the timer, with a budget of 6 seconds per place in the pool', () => {
    const { game, now } = startFill({ changes: { timed: true } });
    const budgetMs = 6000 * oceaniaIds.length;
    game.send({ type: 'submit', text: nameOf(oceaniaIds[0]!) });

    expect(game.timeLeftMs()).toBe(budgetMs);
    now.current += budgetMs - 1;
    expect(game.timeLeftMs()).toBe(1);
    game.send({ type: 'tick' });
    expect(game.state.phase).toBe('fill');

    now.current += 1;
    game.send({ type: 'tick' });

    expect(resultsOf(game)).toMatchObject({ score: 1, isComplete: true, elapsedMs: budgetMs });
  });
});

describe('Fill the map holders', () => {
  it('fills all of a holder\'s land in the tier when it is named', () => {
    const { game } = startFill({ changes: { region: 'Europe' } });

    game.send({ type: 'submit', text: 'United Kingdom' });

    const { filledPlaceIds, filledLandPlaceIds } = fillStateOf(game);
    expect(filledPlaceIds).toEqual(['GBR']);
    const gbrLand = places.filter(place => place.holder === 'GBR').map(({ id }) => id);
    expect(gbrLand.length).toBeGreaterThan(0);
    expect(filledLandPlaceIds).toEqual(expect.arrayContaining(['GBR', ...gbrLand]));
    expect(fillStateOf(game).score).toBe(1);
  });

  it('fills only the place itself where the dependency is a place of the tier', () => {
    const { game } = startFill({ changes: { region: 'Europe', tier: 'dependencies' } });

    game.send({ type: 'submit', text: 'United Kingdom' });

    expect(fillStateOf(game).filledLandPlaceIds).toEqual(['GBR']);
  });

  it('does not take a merged dependency as a place of the pool', () => {
    const { game } = startFill({ changes: { region: 'Europe' } });

    game.send({ type: 'submit', text: 'Gibraltar' });

    expect(fillStateOf(game)).toMatchObject({ score: 0, lastInput: { kind: 'outside' } });
  });
});

describe('Fill the map recording', () => {
  it('counts a round ended by the timer for the log and the personal bests', () => {
    const { game, now, storage } = startFill({ changes: { timed: true } });
    game.send({ type: 'submit', text: nameOf(oceaniaIds[0]!) });
    game.send({ type: 'submit', text: nameOf(oceaniaIds[1]!) });
    now.current += 6000 * oceaniaIds.length;
    game.send({ type: 'tick' });

    expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ mode: 'fill', variant: 'map', region: 'Oceania', tier: 'sovereign', deckSize: oceaniaIds.length, timed: true, easy: false, score: 2, complete: true })]);
    expect(storedJson(storage, 'ti:bests')).toEqual({ [`fill:map:Oceania:sovereign:all:normal`]: { score: 2, fastestPerfectMs: null } });
    expect(resultsOf(game).isNewBest).toBe(true);
  });

  it('logs an ended round as incomplete and keeps it out of the personal bests', () => {
    const { game, storage } = startFill();
    game.send({ type: 'submit', text: nameOf(oceaniaIds[0]!) });
    game.send({ type: 'askEnd' });
    game.send({ type: 'end' });

    expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ mode: 'fill', score: 1, complete: false })]);
    expect(storage.getItem('ti:bests')).toBeNull();
    expect(resultsOf(game).isNewBest).toBe(false);
  });

  it('records a completed round\'s fastest perfect time and a new best on a better score', () => {
    const storage = memoryStorage();
    const first = startFill({ storage });
    nameAll(first.game, oceaniaIds.slice(0, 3));
    first.game.send({ type: 'askEnd' });
    first.game.send({ type: 'end' });
    const second = startFill({ storage });
    second.now.current += 12_000;
    nameAll(second.game, oceaniaIds);

    expect(resultsOf(second.game)).toMatchObject({ isComplete: true, elapsedMs: 12_000 });
    expect(storedJson(storage, 'ti:bests')).toEqual({ 'fill:map:Oceania:sovereign:all:normal': { score: oceaniaIds.length, fastestPerfectMs: 12_000 } });
  });

  it('writes no per-place records', () => {
    const { game, storage } = startFill();
    nameAll(game, oceaniaIds.slice(0, 4));
    game.send({ type: 'submit', text: 'atlantis' });
    game.send({ type: 'askEnd' });
    game.send({ type: 'end' });

    expect(storage.getItem('ti:places')).toBeNull();
  });
});

describe('Fill the map resume', () => {
  it('persists the round in ti:round after every filled place and resumes it on launch', () => {
    const { game, storage, now } = startFill({ changes: { timed: true } });
    nameAll(game, oceaniaIds.slice(0, 3));
    expect(storedJson(storage, 'ti:round')).toMatchObject({ setup: { mode: 'fill' }, answers: [{ placeId: oceaniaIds[0] }, { placeId: oceaniaIds[1] }, { placeId: oceaniaIds[2] }] });

    now.current += 60_000;
    const relaunched = createGame({ places, names, version: shippedVersion, random: Math.random, clock: () => now.current, storage });

    expect(relaunched.state).toMatchObject({ phase: 'fill', score: 3, filledPlaceIds: oceaniaIds.slice(0, 3), deckSize: oceaniaIds.length, isPaused: true });

    relaunched.send({ type: 'resume' });
    relaunched.send({ type: 'submit', text: nameOf(oceaniaIds[3]!) });
    expect(fillStateOf(relaunched).score).toBe(4);
  });

  it('ends a resumed round whose time ran out while the app was closed, complete', () => {
    const { game, storage, now } = startFill({ changes: { timed: true } });
    for (let pauses = 0; pauses < 3; pauses += 1) {
      game.send({ type: 'pause' });
      game.send({ type: 'resume' });
    }
    game.send({ type: 'submit', text: nameOf(oceaniaIds[0]!) });

    now.current += 6000 * oceaniaIds.length + 1;
    const relaunched = createGame({ places, names, version: shippedVersion, random: Math.random, clock: () => now.current, storage });

    expect(relaunched.state).toMatchObject({ phase: 'results', score: 1, isComplete: true });
    expect(storage.getItem('ti:round')).toBeNull();
  });

  it('drops a stored round that does not hold together', () => {
    const { storage } = startFill();
    const stored = storedJson(storage, 'ti:round');
    storage.setItem('ti:round', JSON.stringify({ ...stored, answers: [{ placeId: 'ZZZ', tappedPlaceId: 'ZZZ', outcome: 'right' }] }));

    const relaunched = createGame({ places, names, version: shippedVersion, random: Math.random, clock: () => startOfDay, storage });

    expect(relaunched.state.phase).toBe('home');
  });
});
