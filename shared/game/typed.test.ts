import { describe, expect, it } from 'vitest';
import shippedNames from '../../public/data/names.json';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame, rightAnswerAdvanceMs } from './game';
import type { GameState, KeyValueStorage, Place, RoundSetup } from './game';
import type { NamesFile, PlaceNames } from './matcher';

const places = shippedPlaces as Place[];
const names = shippedNames as NamesFile;

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

const startTyped = ({ seed = 1, changes = {}, storage = memoryStorage(), clock = () => Date.UTC(2026, 10, 17) }: { seed?: number, changes?: Partial<RoundSetup>, storage?: KeyValueStorage, clock?: () => number } = {}) => {
  const game = createGame({ places, names, version: shippedVersion, random: seededRandom(seed), clock, storage });
  game.send({ type: 'start', setup: { ...game.setupFor('name'), ...changes } });
  return game;
};

type RoundGame = ReturnType<typeof startTyped>;

const promptedPlaceId = (game: RoundGame) => {
  const { state } = game;
  if (state.phase !== 'prompt') throw new Error(`Expected a prompt, got ${state.phase}`);
  return state.placeId;
};

const promptOf = (game: RoundGame) => game.state as Extract<GameState, { phase: 'prompt' }>;

const nameOf = (placeId: string, language: 'en' | 'de' = 'en') => (names[placeId] as PlaceNames)[language].name;

const someOtherPlaceId = (placeId: string) => (placeId === 'DEU' ? 'FRA' : 'DEU');

const resultsOf = (game: RoundGame) => {
  const { state } = game;
  if (state.phase !== 'results') throw new Error(`Expected results, got ${state.phase}`);
  return state;
};

const storedPlaces = (storage: KeyValueStorage) => JSON.parse(storage.getItem('ti:places') ?? '{}');

describe('Name on the map setup', () => {
  it('is the whole world, sovereign tier, 10 prompts, untimed and Easy mode off, with no variant choice', () => {
    const game = createGame({ places, names, version: shippedVersion, random: seededRandom(1), clock: () => 0, storage: memoryStorage() });
    const setup = game.setupFor('name');

    expect(setup).toEqual({ mode: 'name', variant: 'map', region: 'world', tier: 'sovereign', deckSize: 10, easy: false, timed: false });
    expect(game.choicesFor(setup).variants.map(({ value }) => value)).toEqual(['map']);
  });

  it('asks every place of the tier, flags or not', () => {
    const game = createGame({ places, names, version: shippedVersion, random: seededRandom(1), clock: () => 0, storage: memoryStorage() });

    expect(game.poolOf(game.setupFor('name'))).toHaveLength(197);
    expect(game.poolOf({ ...game.setupFor('name'), tier: 'dependencies' })).toHaveLength(places.length);
  });

  it('is remembered apart from Find on the map, and is the setup played again', () => {
    const storage = memoryStorage();
    const game = startTyped({ storage, changes: { region: 'Africa' } });

    expect(game.setupFor('find')).toMatchObject({ mode: 'find', region: 'world' });
    expect(createGame({ places, names, version: shippedVersion, random: seededRandom(1), clock: () => 0, storage }).lastSetup()).toMatchObject({ mode: 'name', region: 'Africa' });
  });
});

describe('typed answers', () => {
  it('take the asked place\'s name as right, in English or German and with a small typo', () => {
    for (const typed of [(placeId: string) => nameOf(placeId), (placeId: string) => nameOf(placeId, 'de'), (placeId: string) => `${nameOf(placeId)}x`]) {
      const game = startTyped({ changes: { region: 'Europe' } });
      const placeId = promptedPlaceId(game);

      game.send({ type: 'submit', text: typed(placeId) });

      expect(game.state).toMatchObject({ phase: 'verdict', score: 1, answer: { placeId, tappedPlaceId: placeId, outcome: 'right' } });
    }
  });

  it('take another real place as wrong and name it, waiting for Next', () => {
    const game = startTyped();
    const placeId = promptedPlaceId(game);
    const typedPlaceId = someOtherPlaceId(placeId);

    game.send({ type: 'submit', text: nameOf(typedPlaceId) });

    expect(game.state).toMatchObject({ phase: 'verdict', score: 0, answer: { placeId, tappedPlaceId: typedPlaceId, outcome: 'wrong' } });
    expect(game.state).toMatchObject({ progress: ['wrong', ...Array(9).fill('pending')] });
  });

  it('take a real place outside the pool as wrong: outside the region and outside the tier', () => {
    for (const [typed, typedPlaceId] of [['Australia', 'AUS'], ['Greenland', 'GRL']]) {
      const game = startTyped({ changes: { region: 'Europe' } });
      const placeId = promptedPlaceId(game);

      game.send({ type: 'submit', text: typed! });

      expect(game.state).toMatchObject({ phase: 'verdict', score: 0, answer: { placeId, tappedPlaceId: typedPlaceId, outcome: 'wrong' } });
    }
  });

  it('score nothing when ambiguous: the prompt stays open, says so, and still takes the right name', () => {
    const storage = memoryStorage();
    const game = startTyped({ storage });
    const placeId = promptedPlaceId(game);

    game.send({ type: 'submit', text: 'congo' });

    expect(game.state).toMatchObject({ phase: 'prompt', placeId, score: 0, unresolvedAnswers: ['ambiguous'], progress: ['current', ...Array(9).fill('pending')] });
    expect(storedPlaces(storage)).toEqual({});

    game.send({ type: 'submit', text: nameOf(placeId) });

    expect(game.state).toMatchObject({ phase: 'verdict', score: 1, answer: { outcome: 'right' } });
  });

  it('score nothing when nothing matches, and every retype counts as nothing', () => {
    const storage = memoryStorage();
    const game = startTyped({ storage });
    const placeId = promptedPlaceId(game);

    game.send({ type: 'submit', text: 'atlantis' });
    game.send({ type: 'submit', text: '' });

    expect(game.state).toMatchObject({ phase: 'prompt', placeId, score: 0, unresolvedAnswers: ['none', 'none'] });
    expect(storedPlaces(storage)).toEqual({});
  });

  it('start each prompt with no unresolved answers', () => {
    const game = startTyped();
    game.send({ type: 'submit', text: 'congo' });
    game.send({ type: 'dontKnow' });
    game.send({ type: 'next' });

    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2, unresolvedAnswers: [] });
  });

  it('are the only answers: a tap on a place answers nothing, but continues a verdict', () => {
    let now = Date.UTC(2026, 10, 17);
    const game = startTyped({ clock: () => now });
    const placeId = promptedPlaceId(game);

    game.send({ type: 'tap', placeId });

    expect(game.state).toMatchObject({ phase: 'prompt', placeId, score: 0 });

    game.send({ type: 'submit', text: nameOf(someOtherPlaceId(placeId)) });
    now += 1000;
    game.send({ type: 'tap' });

    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2 });
  });

  it('move on by themselves after a right answer, like taps', () => {
    let now = Date.UTC(2026, 10, 17);
    const game = startTyped({ clock: () => now });

    game.send({ type: 'submit', text: nameOf(promptedPlaceId(game)) });
    now += rightAnswerAdvanceMs;
    game.send({ type: 'tick' });

    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2, score: 1 });
  });

  it('record the typed place as confused with, under the mode and its single variant', () => {
    const storage = memoryStorage();
    const game = startTyped({ storage });
    const placeId = promptedPlaceId(game);
    const typedPlaceId = someOtherPlaceId(placeId);

    game.send({ type: 'submit', text: nameOf(typedPlaceId) });

    expect(storedPlaces(storage)).toEqual({ 'name:map': { [placeId]: { seen: 1, correct: 0, recent: [0], easySeen: 0, easyCorrect: 0, confusedWith: typedPlaceId } } });
  });

  it('are ignored in Find on the map, where taps answer', () => {
    const game = createGame({ places, names, version: shippedVersion, random: seededRandom(1), clock: () => 0, storage: memoryStorage() });
    game.send({ type: 'start', setup: game.setupFor('find') });
    const before = game.state;

    game.send({ type: 'submit', text: 'Germany' });
    game.send({ type: 'dontKnow' });

    expect(game.state).toEqual(before);
  });
});

describe('I don\'t know', () => {
  it('is missed: nothing scored, the place revealed, waiting for Next', () => {
    let now = Date.UTC(2026, 10, 17);
    const game = startTyped({ clock: () => now });
    const placeId = promptedPlaceId(game);

    game.send({ type: 'dontKnow' });
    now += rightAnswerAdvanceMs * 10;
    game.send({ type: 'tick' });

    expect(game.state).toMatchObject({ phase: 'verdict', score: 0, answer: { placeId, outcome: 'missed' }, progress: ['missed', ...Array(9).fill('pending')] });

    game.send({ type: 'next' });

    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2 });
  });

  it('is recorded as seen and not right, with no place confused', () => {
    const storage = memoryStorage();
    const game = startTyped({ storage });
    const placeId = promptedPlaceId(game);

    game.send({ type: 'dontKnow' });

    expect(storedPlaces(storage)).toEqual({ 'name:map': { [placeId]: { seen: 1, correct: 0, recent: [0], easySeen: 0, easyCorrect: 0 } } });
  });

  it('shows as missed on the results of a complete round', () => {
    const game = startTyped();
    const askedPlaceIds: string[] = [];
    while (game.state.phase === 'prompt') {
      const placeId = promptedPlaceId(game);
      askedPlaceIds.push(placeId);
      if (askedPlaceIds.length === 1) game.send({ type: 'submit', text: nameOf(placeId) });
      else if (askedPlaceIds.length === 2) game.send({ type: 'submit', text: nameOf(someOtherPlaceId(placeId)) });
      else game.send({ type: 'dontKnow' });
      game.send({ type: 'next' });
    }

    const results = resultsOf(game);

    expect(results).toMatchObject({ isComplete: true, score: 1, deckSize: 10, missedPlaceIds: [] });
    expect(results.answers.map(({ outcome }) => outcome)).toEqual(['right', 'wrong', ...Array(8).fill('missed')]);
  });

  it('survives a relaunch mid-verdict', () => {
    const storage = memoryStorage();
    const game = startTyped({ storage });
    const placeId = promptedPlaceId(game);
    game.send({ type: 'dontKnow' });

    const relaunched = createGame({ places, names, version: shippedVersion, random: seededRandom(1), clock: () => Date.UTC(2026, 10, 17), storage });

    expect(relaunched.state).toMatchObject({ phase: 'prompt', promptNumber: 2, setup: { mode: 'name' }, progress: ['missed', 'current', ...Array(8).fill('pending')] });
    expect(promptOf(relaunched).placeId).not.toBe(placeId);
  });
});

describe('timed typed rounds', () => {
  it('last 15 s per prompt of the real deck', () => {
    expect(startTyped({ changes: { timed: true } }).timeLeftMs()).toBe(150_000);
    expect(startTyped({ changes: { timed: true, region: 'Oceania', deckSize: 'all' } }).timeLeftMs()).toBe(14 * 15_000);
  });

  it('take no typed answer once the clock has run out, and end the round', () => {
    let now = Date.UTC(2026, 10, 17);
    const game = startTyped({ clock: () => now, changes: { timed: true } });
    const placeId = promptedPlaceId(game);

    now += 150_000;
    game.send({ type: 'submit', text: nameOf(placeId) });

    expect(resultsOf(game)).toMatchObject({ isComplete: false, score: 0, answers: [] });
  });
});
