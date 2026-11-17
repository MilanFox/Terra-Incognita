import { describe, expect, it } from 'vitest';
import shippedPlaces from '../../public/data/places.json';
import { createGame } from './game';
import type { GameState, KeyValueStorage, Place } from './game';

const places = shippedPlaces as Place[];

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

const startGame = (seed = 1) => {
  const game = createGame({ places, random: seededRandom(seed), clock: () => Date.UTC(2026, 10, 17), storage: memoryStorage() });
  game.send({ type: 'start', setup: game.setupFor('find') });
  return game;
};

type RoundGame = ReturnType<typeof startGame>;

const promptedPlaceId = (game: RoundGame) => {
  const { state } = game;
  if (state.phase !== 'prompt') throw new Error(`Expected a prompt, got ${state.phase}`);
  return state.placeId;
};

const someOtherPlaceId = (placeId: string) => (placeId === 'DEU' ? 'FRA' : 'DEU');

const playThrough = (game: RoundGame, rightCount: number) => {
  const askedPlaceIds: string[] = [];
  while (game.state.phase === 'prompt') {
    const placeId = promptedPlaceId(game);
    askedPlaceIds.push(placeId);
    game.send({ type: 'tap', placeId: askedPlaceIds.length <= rightCount ? placeId : someOtherPlaceId(placeId) });
    game.send({ type: 'next' });
  }
  return askedPlaceIds;
};

const resultsOf = (game: RoundGame) => {
  const { state } = game;
  if (state.phase !== 'results') throw new Error(`Expected results, got ${state.phase}`);
  return state;
};

const sovereignIds = places.filter(({ tier }) => tier === 'sovereign').map(({ id }) => id);

describe('first-time setup', () => {
  it('is the whole world, sovereign tier and 10 prompts by name', () => {
    const game = startGame();

    expect(game.setupFor('find')).toEqual({ mode: 'find', variant: 'name', region: 'world', tier: 'sovereign', deckSize: 10 });
  });

  it('draws on a pool of the 197 sovereign places', () => {
    const game = startGame();

    const pool = game.poolOf(game.setupFor('find'));

    expect(pool).toHaveLength(197);
    expect(pool).toEqual(sovereignIds);
    expect(pool).not.toContain('GRL');
    expect(pool).not.toContain('SOL');
  });
});

describe('the deck', () => {
  it('asks 10 different places from the pool, each once', () => {
    const game = startGame();

    const askedPlaceIds = playThrough(game, 10);

    expect(askedPlaceIds).toHaveLength(10);
    expect(new Set(askedPlaceIds).size).toBe(10);
    expect(sovereignIds).toEqual(expect.arrayContaining(askedPlaceIds));
  });

  it('is shuffled by the random source', () => {
    expect(playThrough(startGame(7), 10)).toEqual(playThrough(startGame(7), 10));
    expect(playThrough(startGame(7), 10)).not.toEqual(playThrough(startGame(8), 10));
  });

  it('starts on the first of 10 progress cells with nothing scored', () => {
    const { state } = startGame();

    expect(state).toMatchObject({ phase: 'prompt', promptNumber: 1, deckSize: 10, score: 0 });
    expect((state as Extract<GameState, { phase: 'prompt' }>).progress).toEqual(['current', ...Array(9).fill('pending')]);
  });
});

describe('one attempt', () => {
  it('takes a right tap as right', () => {
    const game = startGame();
    const placeId = promptedPlaceId(game);

    game.send({ type: 'tap', placeId });

    expect(game.state).toMatchObject({ phase: 'verdict', score: 1, answer: { placeId, tappedPlaceId: placeId, outcome: 'right' } });
  });

  it('takes a wrong tap as wrong, names the tapped place and ignores further taps', () => {
    const game = startGame();
    const placeId = promptedPlaceId(game);
    const tappedPlaceId = someOtherPlaceId(placeId);

    game.send({ type: 'tap', placeId: tappedPlaceId });
    game.send({ type: 'tap', placeId });

    expect(game.state).toMatchObject({ phase: 'verdict', score: 0, answer: { placeId, tappedPlaceId, outcome: 'wrong' } });
    expect(game.state).toMatchObject({ progress: ['wrong', ...Array(9).fill('pending')] });
  });

  it('ignores taps on land that is no place', () => {
    const game = startGame();
    const before = game.state;

    game.send({ type: 'tap', placeId: 'ATA' });

    expect(game.state).toEqual(before);
  });

  it('moves to the next prompt only on Next', () => {
    const game = startGame();
    const firstPlaceId = promptedPlaceId(game);

    game.send({ type: 'next' });
    expect(game.state).toMatchObject({ phase: 'prompt', placeId: firstPlaceId });

    game.send({ type: 'tap', placeId: firstPlaceId });
    game.send({ type: 'next' });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2, score: 1, progress: ['right', 'current', ...Array(8).fill('pending')] });
  });
});

describe('scoring', () => {
  it('ends on results with the right answers out of the deck size, prompt by prompt', () => {
    const game = startGame();

    const askedPlaceIds = playThrough(game, 7);
    const results = resultsOf(game);

    expect(results).toMatchObject({ score: 7, deckSize: 10 });
    expect(results.answers.map(({ placeId }) => placeId)).toEqual(askedPlaceIds);
    expect(results.answers.map(({ outcome }) => outcome)).toEqual([...Array(7).fill('right'), ...Array(3).fill('wrong')]);
  });

  it('leads home from results and plays again with a fresh deck', () => {
    const game = startGame();
    playThrough(game, 0);

    expect(resultsOf(game).score).toBe(0);

    game.send({ type: 'leave' });
    expect(game.state).toEqual({ phase: 'home' });

    game.send({ type: 'start', setup: game.setupFor('find') });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 1, score: 0 });
  });
});
