import { describe, expect, it } from 'vitest';
import shippedPlaces from '../../public/data/places.json';
import { createGame } from './game';
import type { GameState, KeyValueStorage, Place, RoundSetup } from './game';

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

const startGame = (seed = 1, clock = () => Date.UTC(2026, 10, 17)) => {
  const game = createGame({ places, random: seededRandom(seed), clock, storage: memoryStorage() });
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

describe('answer timing', () => {
  const startTimedGame = () => {
    let now = Date.UTC(2026, 10, 17);
    const game = startGame(1, () => now);
    const wait = (milliseconds: number) => {
      now += milliseconds;
      game.send({ type: 'tick' });
    };
    return { game, wait };
  };

  it('moves on by itself 1.3 s after a right answer, not before', () => {
    const { game, wait } = startTimedGame();
    game.send({ type: 'tap', placeId: promptedPlaceId(game) });

    wait(1299);
    expect(game.state.phase).toBe('verdict');

    wait(1);
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2, score: 1 });
  });

  it('lets a right answer be skipped by Next or by a tap once the answering tap has settled', () => {
    const { game, wait } = startTimedGame();
    game.send({ type: 'tap', placeId: promptedPlaceId(game) });
    game.send({ type: 'tap', placeId: 'DEU' });
    expect(game.state.phase).toBe('verdict');

    wait(150);
    game.send({ type: 'tap', placeId: 'DEU' });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2 });

    game.send({ type: 'tap', placeId: promptedPlaceId(game) });
    game.send({ type: 'next' });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 3 });
  });

  it('never moves on by itself after a wrong answer', () => {
    const { game, wait } = startTimedGame();
    game.send({ type: 'tap', placeId: someOtherPlaceId(promptedPlaceId(game)) });

    wait(60_000);

    expect(game.state).toMatchObject({ phase: 'verdict', answer: { outcome: 'wrong' } });
  });

  it('continues from a wrong answer on Next or on a later tap on the map', () => {
    const { game, wait } = startTimedGame();
    game.send({ type: 'tap', placeId: someOtherPlaceId(promptedPlaceId(game)) });
    game.send({ type: 'next' });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2 });

    game.send({ type: 'tap', placeId: someOtherPlaceId(promptedPlaceId(game)) });
    wait(150);
    game.send({ type: 'tap', placeId: 'DEU' });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 3 });

    game.send({ type: 'tap', placeId: someOtherPlaceId(promptedPlaceId(game)) });
    wait(150);
    game.send({ type: 'tap' });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 4 });
  });

  it('ends on results when the last right answer runs out', () => {
    const { game, wait } = startTimedGame();
    for (let prompt = 0; prompt < 10; prompt += 1) {
      game.send({ type: 'tap', placeId: promptedPlaceId(game) });
      wait(1300);
    }

    expect(resultsOf(game)).toMatchObject({ score: 10 });
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

const gameOver = (placesInPlay = places, storage = memoryStorage()) => createGame({ places: placesInPlay, random: seededRandom(3), clock: () => Date.UTC(2026, 10, 17), storage });

const setupOf = (game: ReturnType<typeof gameOver>, changes: Partial<RoundSetup>): RoundSetup => ({ ...game.setupFor('find'), ...changes });

describe('the pool', () => {
  it('grows by tier: 197 sovereign, 203 with de facto, 245 with dependencies', () => {
    const game = gameOver();

    expect(game.poolOf(setupOf(game, { tier: 'sovereign' }))).toHaveLength(197);
    expect(game.poolOf(setupOf(game, { tier: 'defacto' }))).toHaveLength(203);
    expect(game.poolOf(setupOf(game, { tier: 'dependencies' }))).toHaveLength(245);
  });

  it('narrows to one region after the tier', () => {
    const game = gameOver();

    const sovereignOceania = game.poolOf(setupOf(game, { region: 'Oceania', tier: 'sovereign' }));
    const dependenciesOceania = game.poolOf(setupOf(game, { region: 'Oceania', tier: 'dependencies' }));

    expect(sovereignOceania).toHaveLength(14);
    expect(dependenciesOceania).toHaveLength(28);
    expect(sovereignOceania).not.toContain('NCL');
    expect(dependenciesOceania).toContain('NCL');
    expect(dependenciesOceania.every(placeId => places.find(({ id }) => id === placeId)!.region === 'Oceania')).toBe(true);
  });

  it('asks every place of a find-by-name pool, flags or not', () => {
    const game = gameOver();
    const pool = game.poolOf(setupOf(game, { tier: 'dependencies' }));

    expect(pool).toEqual(places.map(({ id }) => id));
  });
});

describe('setup choices', () => {
  it('counts every region under the chosen tier and every tier under the chosen region', () => {
    const game = gameOver();

    const choices = game.choicesFor(setupOf(game, { region: 'Oceania', tier: 'sovereign' }));

    expect(choices.regions.find(({ value }) => value === 'world')).toMatchObject({ count: 197, isAvailable: true });
    expect(choices.regions.find(({ value }) => value === 'Oceania')).toMatchObject({ count: 14, isAvailable: true });
    expect(choices.tiers.map(({ count }) => count)).toEqual([14, 14, 28]);
    expect(choices.regions[0]!.value).toBe('world');
  });

  it('shows a combination under 5 places with its count but unavailable, and refuses to start it', () => {
    const fewSovereignOceania = ({ region, tier, id }: Place) => region !== 'Oceania' || tier === 'dependencies' || ['AUS', 'NZL', 'FJI', 'PNG'].includes(id);
    const game = gameOver(places.filter(fewSovereignOceania));
    const oceaniaSetup = setupOf(game, { region: 'Oceania', tier: 'sovereign' });

    const choices = game.choicesFor(setupOf(game, { tier: 'sovereign' }));
    expect(choices.regions.find(({ value }) => value === 'Oceania')).toEqual({ value: 'Oceania', count: 4, isAvailable: false });
    expect(game.choicesFor(oceaniaSetup).tiers.map(({ isAvailable }) => isAvailable)).toEqual([false, false, true]);

    game.send({ type: 'start', setup: oceaniaSetup });
    expect(game.state).toEqual({ phase: 'home' });

    game.send({ type: 'start', setup: { ...oceaniaSetup, tier: 'dependencies' } });
    expect(game.state).toMatchObject({ phase: 'prompt', deckSize: 10 });
  });

  it('shrinks a deck bigger than the pool and shows the real count', () => {
    const fewSouthAmerica = ({ region, id }: Place) => region !== 'South America' || ['BRA', 'ARG', 'CHL', 'PER', 'COL', 'BOL', 'URY'].includes(id);
    const game = gameOver(places.filter(fewSouthAmerica));
    const smallPoolSetup = setupOf(game, { region: 'South America' });

    expect(game.choicesFor(smallPoolSetup)).toMatchObject({ playCount: 7, deckSizes: [{ value: 10, count: 7 }, { value: 'all', count: 7 }] });

    game.send({ type: 'start', setup: smallPoolSetup });
    expect(game.state).toMatchObject({ phase: 'prompt', deckSize: 7 });
    expect((game.state as Extract<GameState, { phase: 'prompt' }>).progress).toHaveLength(7);
  });

  it('plays the whole pool on All and 10 on a big pool', () => {
    const game = gameOver();

    expect(game.choicesFor(setupOf(game, { deckSize: 10 })).playCount).toBe(10);
    expect(game.choicesFor(setupOf(game, { deckSize: 'all' })).playCount).toBe(197);

    game.send({ type: 'start', setup: setupOf(game, { deckSize: 'all' }) });
    expect(game.state).toMatchObject({ phase: 'prompt', deckSize: 197 });
  });
});

describe('remembered setup', () => {
  const europeanSetup = { mode: 'find', variant: 'name', region: 'Europe', tier: 'defacto', deckSize: 'all' } as const;

  it('starts from the first-time setup with nothing stored', () => {
    const game = gameOver();

    expect(game.setupFor('find')).toEqual({ mode: 'find', variant: 'name', region: 'world', tier: 'sovereign', deckSize: 10 });
    expect(game.lastSetup()).toEqual(game.setupFor('find'));
  });

  it('keeps the played setup in ti:setup for the next visit, unchanged', () => {
    const storage = memoryStorage();
    const game = gameOver(places, storage);
    game.send({ type: 'start', setup: europeanSetup });

    expect(storage.getItem('ti:setup')).not.toBeNull();

    const nextVisit = gameOver(places, storage);
    expect(nextVisit.setupFor('find')).toEqual(europeanSetup);
    expect(nextVisit.lastSetup()).toEqual(europeanSetup);

    nextVisit.send({ type: 'start', setup: nextVisit.lastSetup() });
    expect(nextVisit.state).toMatchObject({ phase: 'prompt', setup: europeanSetup, deckSize: 48 });
  });

  it('falls back to the first-time setup when the stored one is damaged', () => {
    const storage = memoryStorage();
    storage.setItem('ti:setup', '{"lastMode":"find","setups":{"find":{"mode":"find","region":"Atlantis"}}}');
    expect(gameOver(places, storage).setupFor('find')).toEqual({ mode: 'find', variant: 'name', region: 'world', tier: 'sovereign', deckSize: 10 });

    storage.setItem('ti:setup', 'not json');
    expect(gameOver(places, storage).lastSetup().region).toBe('world');
  });
});

describe('merged land', () => {
  const startOnPrompt = (placeId: string, tier: 'sovereign' | 'defacto' | 'dependencies') => {
    const game = gameOver();
    game.send({ type: 'start', setup: setupOf(game, { tier, deckSize: 'all' }) });
    while (game.state.phase === 'prompt' && promptedPlaceId(game as RoundGame) !== placeId) {
      game.send({ type: 'tap', placeId: 'DEU' });
      game.send({ type: 'next' });
    }
    return game;
  };

  it('answers as its holder: Gibraltar is the United Kingdom in the sovereign tier', () => {
    const game = startOnPrompt('GBR', 'sovereign');

    game.send({ type: 'tap', placeId: 'GIB' });

    expect(game.state).toMatchObject({ phase: 'verdict', answer: { placeId: 'GBR', tappedPlaceId: 'GBR', outcome: 'right' } });
  });

  it('answers a de facto state as its parent in the sovereign tier, and a dependency as its holder in the de facto tier', () => {
    const sovereign = startOnPrompt('SOM', 'sovereign');
    sovereign.send({ type: 'tap', placeId: 'SOL' });
    expect(sovereign.state).toMatchObject({ answer: { tappedPlaceId: 'SOM', outcome: 'right' } });

    const defacto = startOnPrompt('DNK', 'defacto');
    defacto.send({ type: 'tap', placeId: 'GRL' });
    expect(defacto.state).toMatchObject({ answer: { tappedPlaceId: 'DNK', outcome: 'right' } });
  });

  it('is a wrong answer as the holder when another place was asked', () => {
    const game = startOnPrompt('FRA', 'sovereign');

    game.send({ type: 'tap', placeId: 'GIB' });

    expect(game.state).toMatchObject({ answer: { placeId: 'FRA', tappedPlaceId: 'GBR', outcome: 'wrong' } });
  });

  it('stays its own place in the dependencies tier', () => {
    const game = startOnPrompt('GRL', 'dependencies');

    game.send({ type: 'tap', placeId: 'DNK' });
    expect(game.state).toMatchObject({ answer: { placeId: 'GRL', tappedPlaceId: 'DNK', outcome: 'wrong' } });
  });
});
