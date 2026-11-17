import { describe, expect, it } from 'vitest';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame, deepestTierPlayed, rightAnswerAdvanceMs, rightAnswerHoldMs } from './game';
import type { SchemaMigration } from './migrations';
import type { DataVersion, GameState, KeyValueStorage, Place, RoundSetup } from './game';

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
  const game = createGame({ places, version: shippedVersion, random: seededRandom(seed), clock, storage: memoryStorage() });
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
  it('is the whole world, sovereign tier, 10 prompts by flag, untimed and Easy mode off', () => {
    const game = startGame();

    expect(game.setupFor('find')).toEqual({ mode: 'find', variant: 'flag', region: 'world', tier: 'sovereign', deckSize: 10, easy: false, timed: false });
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

const gameOver = (placesInPlay = places, storage = memoryStorage()) => createGame({ places: placesInPlay, version: shippedVersion, random: seededRandom(3), clock: () => Date.UTC(2026, 10, 17), storage });

const setupOf = (game: ReturnType<typeof gameOver>, changes: Partial<RoundSetup>): RoundSetup => ({ ...game.setupFor('find'), variant: 'name', ...changes });

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
  const europeanSetup = { mode: 'find', variant: 'name', region: 'Europe', tier: 'defacto', deckSize: 'all', easy: true, timed: true } as const;

  it('starts from the first-time setup with nothing stored', () => {
    const game = gameOver();

    expect(game.setupFor('find')).toEqual({ mode: 'find', variant: 'flag', region: 'world', tier: 'sovereign', deckSize: 10, easy: false, timed: false });
    expect(game.lastSetup()).toBeUndefined();
  });

  it('keeps the played setup in ti:setup for the next visit, unchanged', () => {
    const storage = memoryStorage();
    const game = gameOver(places, storage);
    game.send({ type: 'start', setup: europeanSetup });

    expect(storage.getItem('ti:setup')).not.toBeNull();

    const nextVisit = gameOver(places, storage);
    expect(nextVisit.setupFor('find')).toEqual(europeanSetup);
    expect(nextVisit.lastSetup()).toEqual(europeanSetup);

    nextVisit.send({ type: 'start', setup: nextVisit.lastSetup()! });
    expect(nextVisit.state).toMatchObject({ phase: 'prompt', setup: europeanSetup, deckSize: 48 });
  });

  it('falls back to the first-time setup when the stored one is damaged', () => {
    const storage = memoryStorage();
    storage.setItem('ti:setup', '{"lastMode":"find","setups":{"find":{"mode":"find","region":"Atlantis"}}}');
    expect(gameOver(places, storage).setupFor('find')).toEqual({ mode: 'find', variant: 'flag', region: 'world', tier: 'sovereign', deckSize: 10, easy: false, timed: false });

    storage.setItem('ti:setup', 'not json');
    expect(gameOver(places, storage).lastSetup()).toBeUndefined();
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

describe('variants', () => {
  const flaglessIds = places.filter(({ flag }) => flag === null).map(({ id }) => id);
  const variantsWithFlags = ['flag', 'both'] as const;

  it('leave flagless places out of the flag variants in every tier, and keep them in by name', () => {
    const game = gameOver();
    const sizes = (variant: RoundSetup['variant']) => (['sovereign', 'defacto', 'dependencies'] as const)
      .map(tier => game.poolOf(setupOf(game, { variant, tier })).length);

    expect(flaglessIds).toHaveLength(6);
    expect(sizes('name')).toEqual([197, 203, 245]);
    for (const variant of variantsWithFlags) {
      expect(sizes(variant)).toEqual([197, 203, 239]);
      expect(game.poolOf(setupOf(game, { variant, tier: 'dependencies' }))).not.toContain('WLF');
      expect(flaglessIds.every(id => !game.poolOf(setupOf(game, { variant, tier: 'dependencies' })).includes(id))).toBe(true);
    }
    expect(game.poolOf(setupOf(game, { tier: 'dependencies' }))).toContain('WLF');
  });

  it('show the real count in the choices', () => {
    const game = gameOver();
    const dependenciesByFlag = setupOf(game, { variant: 'flag', tier: 'dependencies', deckSize: 'all' });

    expect(game.choicesFor(dependenciesByFlag).playCount).toBe(239);
    expect(game.choicesFor(dependenciesByFlag).variants).toEqual([
      { value: 'flag', count: 239, isAvailable: true },
      { value: 'name', count: 245, isAvailable: true },
      { value: 'both', count: 239, isAvailable: true },
    ]);
  });

  it('never mix within a round: every prompt of the round carries the round\'s variant', () => {
    const game = gameOver();
    game.send({ type: 'start', setup: setupOf(game, { variant: 'both', tier: 'dependencies', deckSize: 'all' }) });
    const askedPlaceIds: string[] = [];
    while (game.state.phase === 'prompt') {
      expect(game.state.setup.variant).toBe('both');
      askedPlaceIds.push(game.state.placeId);
      game.send({ type: 'tap', placeId: game.state.placeId });
      game.send({ type: 'next' });
    }

    expect(askedPlaceIds).toHaveLength(239);
    expect(askedPlaceIds.some(id => flaglessIds.includes(id))).toBe(false);
    expect(resultsOf(game).setup.variant).toBe('both');
  });
});

describe('Easy mode', () => {
  const startEasy = (easy: boolean) => {
    const game = gameOver();
    game.send({ type: 'start', setup: setupOf(game, { easy }) });
    return game;
  };

  it('is off by default and marks the round as easy when on', () => {
    expect(gameOver().setupFor('find').easy).toBe(false);
    expect(startEasy(true).state).toMatchObject({ phase: 'prompt', setup: { easy: true } });
    expect(startEasy(false).state).toMatchObject({ phase: 'prompt', setup: { easy: false }, attemptsLeft: 1 });
  });

  it('allows three attempts per prompt: two wrong taps stay on the prompt, the third wrong tap answers', () => {
    const game = startEasy(true);
    const placeId = promptedPlaceId(game);
    const wrongPlaceId = someOtherPlaceId(placeId);

    game.send({ type: 'tap', placeId: wrongPlaceId });
    expect(game.state).toMatchObject({ phase: 'prompt', attemptsLeft: 2, wrongTapPlaceIds: [wrongPlaceId], promptNumber: 1 });
    game.send({ type: 'tap', placeId: wrongPlaceId });
    expect(game.state).toMatchObject({ phase: 'prompt', attemptsLeft: 1, score: 0 });
    game.send({ type: 'tap', placeId: wrongPlaceId });

    expect(game.state).toMatchObject({ phase: 'verdict', score: 0, answer: { placeId, tappedPlaceId: wrongPlaceId, outcome: 'wrong' } });
  });

  it('counts a right tap on a later attempt as right, and gives the next prompt three fresh attempts', () => {
    const game = startEasy(true);
    const placeId = promptedPlaceId(game);

    game.send({ type: 'tap', placeId: someOtherPlaceId(placeId) });
    game.send({ type: 'tap', placeId });
    expect(game.state).toMatchObject({ phase: 'verdict', score: 1, answer: { outcome: 'right' } });

    game.send({ type: 'next' });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2, attemptsLeft: 3, wrongTapPlaceIds: [] });
  });

  it('gives one attempt with Easy mode off', () => {
    const game = startEasy(false);

    game.send({ type: 'tap', placeId: someOtherPlaceId(promptedPlaceId(game)) });

    expect(game.state).toMatchObject({ phase: 'verdict', answer: { outcome: 'wrong' } });
  });
});

describe('end round', () => {
  const endRound = (game: RoundGame) => {
    game.send({ type: 'askEnd' });
    game.send({ type: 'end' });
  };

  it('halts an Easy-mode prompt with attempts left, and Keep playing restores it exactly', () => {
    const game = gameOver();
    game.send({ type: 'start', setup: setupOf(game, { easy: true }) });
    const placeId = promptedPlaceId(game);
    const wrongPlaceId = someOtherPlaceId(placeId);
    game.send({ type: 'tap', placeId: wrongPlaceId });
    const before = { ...game.state, isConfirmingEnd: false };

    game.send({ type: 'askEnd' });
    game.send({ type: 'tap', placeId });
    expect(game.state).toMatchObject({ phase: 'prompt', isConfirmingEnd: true, attemptsLeft: 2, wrongTapPlaceIds: [wrongPlaceId], score: 0 });

    game.send({ type: 'keepPlaying' });
    expect(game.state).toEqual(before);

    game.send({ type: 'askEnd' });
    game.send({ type: 'end' });
    expect(resultsOf(game)).toMatchObject({ isComplete: false, missedPlaceIds: expect.arrayContaining([placeId]) });
  });

  it('counts unreached prompts as missed and marks the round incomplete', () => {
    const game = startGame();
    const deckOrder: string[] = [];
    for (let answered = 0; answered < 3; answered += 1) {
      deckOrder.push(promptedPlaceId(game));
      game.send({ type: 'tap', placeId: promptedPlaceId(game) });
      game.send({ type: 'next' });
    }
    const unreachedPlaceId = promptedPlaceId(game);

    endRound(game);
    const results = resultsOf(game);

    expect(results).toMatchObject({ score: 3, deckSize: 10, isComplete: false });
    expect(results.answers.map(({ placeId }) => placeId)).toEqual(deckOrder);
    expect(results.missedPlaceIds).toHaveLength(7);
    expect(results.missedPlaceIds[0]).toBe(unreachedPlaceId);
    expect(new Set([...deckOrder, ...results.missedPlaceIds]).size).toBe(10);
  });

  it('keeps an answered prompt on the results when the round ends during its verdict', () => {
    const game = startGame();
    const placeId = promptedPlaceId(game);
    game.send({ type: 'tap', placeId: someOtherPlaceId(placeId) });

    endRound(game);

    expect(resultsOf(game)).toMatchObject({ score: 0, isComplete: false, answers: [{ placeId, outcome: 'wrong' }] });
    expect(resultsOf(game).missedPlaceIds).toHaveLength(9);
  });

  it('ends only after the confirm, and ignores play while the confirm is up', () => {
    const game = startGame();
    const placeId = promptedPlaceId(game);

    game.send({ type: 'end' });
    expect(game.state).toMatchObject({ phase: 'prompt', isConfirmingEnd: false });

    game.send({ type: 'askEnd' });
    game.send({ type: 'tap', placeId });
    game.send({ type: 'next' });
    game.send({ type: 'leave' });
    expect(game.state).toMatchObject({ phase: 'prompt', placeId, isConfirmingEnd: true });
  });

  it('restores the exact previous prompt on keep playing', () => {
    const game = startGame();
    const before = game.state;

    game.send({ type: 'askEnd' });
    game.send({ type: 'keepPlaying' });

    expect(game.state).toEqual(before);
  });

  it('keeps a wrong answer waiting for Next after keep playing', () => {
    const game = startGame();
    game.send({ type: 'tap', placeId: someOtherPlaceId(promptedPlaceId(game)) });

    game.send({ type: 'askEnd' });
    game.send({ type: 'keepPlaying' });
    game.send({ type: 'tick' });
    expect(game.state).toMatchObject({ phase: 'verdict', isConfirmingEnd: false });

    game.send({ type: 'next' });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2 });
  });

  it('restarts the hold of a right answer after keep playing', () => {
    let now = Date.UTC(2026, 10, 17);
    const game = startGame(1, () => now);
    game.send({ type: 'tap', placeId: promptedPlaceId(game) });
    now += rightAnswerHoldMs;

    game.send({ type: 'askEnd' });
    now += 5000;
    game.send({ type: 'keepPlaying' });
    game.send({ type: 'tick' });
    expect(game.state.phase).toBe('verdict');

    now += rightAnswerAdvanceMs;
    game.send({ type: 'tick' });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2 });
  });

  it('shows a finished round as complete with nothing unreached', () => {
    const game = startGame();
    playThrough(game, 4);

    expect(resultsOf(game)).toMatchObject({ isComplete: true, missedPlaceIds: [] });
  });

  it('plays again after an ended round with the same setup and a fresh, complete round', () => {
    const game = startGame();
    endRound(game);
    const { setup } = resultsOf(game);

    game.send({ type: 'start', setup });
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 1, isConfirmingEnd: false, setup });

    playThrough(game, 10);
    expect(resultsOf(game)).toMatchObject({ isComplete: true, score: 10 });
  });
});

const recordingGame = (storage = memoryStorage(), placesInPlay = places) => {
  let now = Date.UTC(2026, 10, 17, 9);
  const game = createGame({ places: placesInPlay, version: shippedVersion, random: seededRandom(5), clock: () => now, storage });
  const wait = (milliseconds: number) => {
    now += milliseconds;
  };
  return { game, storage, wait, now: () => now };
};

const storedJson = (storage: KeyValueStorage, key: string) => JSON.parse(storage.getItem(key) ?? 'null');

const firstTimeSetup: RoundSetup = { mode: 'find', variant: 'flag', region: 'world', tier: 'sovereign', deckSize: 10, easy: false, timed: false };

const startRound = (game: RoundGame, setup: Partial<RoundSetup> = {}) => game.send({ type: 'start', setup: { ...firstTimeSetup, ...setup } });

const playRound = (game: RoundGame, setup: Partial<RoundSetup>, rightCount: number) => {
  startRound(game, setup);
  return playThrough(game, rightCount);
};

const endRoundNow = (game: RoundGame) => {
  game.send({ type: 'askEnd' });
  game.send({ type: 'end' });
};

const spendPauses = (game: RoundGame) => {
  for (let pause = 0; pause < 3; pause += 1) {
    game.send({ type: 'pause' });
    game.send({ type: 'resume' });
  }
};

describe('recording per place', () => {
  it('keeps every answered place in ti:places under its mode and variant, after every answer', () => {
    const { game, storage } = recordingGame();
    startRound(game);
    const firstPlaceId = promptedPlaceId(game);

    game.send({ type: 'tap', placeId: firstPlaceId });
    expect(storedJson(storage, 'ti:places')).toEqual({ 'find:flag': { [firstPlaceId]: { seen: 1, correct: 1, recent: [1], easySeen: 0, easyCorrect: 0 } } });

    game.send({ type: 'next' });
    const restOfDeck = playThrough(game, 6);
    const records = storedJson(storage, 'ti:places')['find:flag'];

    expect(Object.keys(records).sort()).toEqual([firstPlaceId, ...restOfDeck].sort());
    for (const placeId of restOfDeck.slice(0, 6)) expect(records[placeId]).toEqual({ seen: 1, correct: 1, recent: [1], easySeen: 0, easyCorrect: 0 });
    for (const placeId of restOfDeck.slice(6)) expect(records[placeId]).toEqual({ seen: 1, correct: 0, recent: [0], easySeen: 0, easyCorrect: 0, confusedWith: someOtherPlaceId(placeId) });
  });

  it('counts only answered prompts when a round is ended early', () => {
    const { game, storage } = recordingGame();
    startRound(game);
    const answeredPlaceId = promptedPlaceId(game);
    game.send({ type: 'tap', placeId: someOtherPlaceId(answeredPlaceId) });

    endRoundNow(game);

    expect(Object.keys(storedJson(storage, 'ti:places')['find:flag'])).toEqual([answeredPlaceId]);
  });

  it('keeps the last 8 normal outcomes in recent and counts every answer', () => {
    const fiveOceaniaPlaces = ({ region, tier, id }: Place) => region !== 'Oceania' || tier !== 'sovereign' || ['AUS', 'NZL', 'FJI', 'PNG', 'WSM'].includes(id);
    const { game, storage } = recordingGame(memoryStorage(), places.filter(fiveOceaniaPlaces));
    for (let round = 1; round <= 10; round += 1) playRound(game, { variant: 'name', region: 'Oceania' }, round <= 3 ? 5 : 0);

    expect(storedJson(storage, 'ti:places')['find:name'].FJI).toEqual({ seen: 10, correct: 3, recent: [1, 0, 0, 0, 0, 0, 0, 0], easySeen: 0, easyCorrect: 0, confusedWith: 'DEU' });
  });

  it('counts Easy-mode answers only in the easy counters', () => {
    const { game, storage } = recordingGame();
    startRound(game, { easy: true });
    const rightOnSecondTry = promptedPlaceId(game);
    game.send({ type: 'tap', placeId: 'BRA' });
    game.send({ type: 'tap', placeId: rightOnSecondTry });
    game.send({ type: 'next' });
    const wrongThreeTimes = promptedPlaceId(game);
    for (const tappedPlaceId of ['BRA', 'CHL', 'PER']) game.send({ type: 'tap', placeId: tappedPlaceId === wrongThreeTimes ? 'DEU' : tappedPlaceId });

    const records = storedJson(storage, 'ti:places')['find:flag'];
    expect(records[rightOnSecondTry]).toEqual({ seen: 0, correct: 0, recent: [], easySeen: 1, easyCorrect: 1, confusedWith: 'BRA' });
    expect(records[wrongThreeTimes]).toMatchObject({ seen: 0, correct: 0, recent: [], easySeen: 1, easyCorrect: 0 });
  });

  it('stores the holder as confusedWith when merged land was tapped, and keeps one record per place across tiers', () => {
    const { game, storage } = recordingGame();
    const answerUntil = (placeId: string, tappedPlaceId: string) => {
      while (promptedPlaceId(game) !== placeId) {
        game.send({ type: 'tap', placeId: promptedPlaceId(game) });
        game.send({ type: 'next' });
      }
      game.send({ type: 'tap', placeId: tappedPlaceId });
      endRoundNow(game);
      game.send({ type: 'leave' });
    };

    startRound(game, { variant: 'name', deckSize: 'all' });
    answerUntil('FRA', 'GIB');
    startRound(game, { variant: 'name', tier: 'dependencies', deckSize: 'all' });
    answerUntil('FRA', 'FRA');

    expect(storedJson(storage, 'ti:places')['find:name'].FRA).toEqual({ seen: 2, correct: 1, recent: [0, 1], easySeen: 0, easyCorrect: 0, confusedWith: 'GBR' });
  });
});

describe('the round log', () => {
  it('logs a finished round with its setup, score, time and data version', () => {
    const { game, storage, wait, now } = recordingGame();
    const startedAt = now();
    startRound(game, { variant: 'both', region: 'Europe', tier: 'defacto', easy: true });
    for (let prompt = 0; prompt < 10; prompt += 1) {
      wait(4000);
      for (const tappedPlaceId of prompt < 6 ? [promptedPlaceId(game)] : ['CHN', 'CHN', 'CHN']) game.send({ type: 'tap', placeId: tappedPlaceId });
      game.send({ type: 'next' });
    }

    expect(storedJson(storage, 'ti:rounds')).toEqual([{
      date: startedAt,
      mode: 'find',
      variant: 'both',
      region: 'Europe',
      tier: 'defacto',
      deckSize: 10,
      timed: false,
      easy: true,
      daily: false,
      learn: false,
      score: 6,
      complete: true,
      elapsedMs: 40_000,
      pausesUsed: 0,
      dataVersion: shippedVersion.dataVersion,
    }]);
  });

  it('logs a round ended early as complete: false, with the real deck size', () => {
    const { game, storage } = recordingGame();
    startRound(game, { deckSize: 'all' });
    game.send({ type: 'tap', placeId: promptedPlaceId(game) });

    endRoundNow(game);

    expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ deckSize: 197, score: 1, complete: false })]);
  });

  it('keeps the last 1,000 rounds', () => {
    const { game, storage, wait } = recordingGame();
    for (let round = 0; round < 1002; round += 1) {
      wait(60_000);
      startRound(game);
      endRoundNow(game);
      game.send({ type: 'leave' });
    }

    const log = storedJson(storage, 'ti:rounds');
    expect(log).toHaveLength(1000);
    expect(log[0].date).toBe(Date.UTC(2026, 10, 17, 9) + 3 * 60_000);
    expect(log[999].date).toBe(Date.UTC(2026, 10, 17, 9) + 1002 * 60_000);
  });
});

describe('elapsed time', () => {
  it('runs from the start of the round to its results, without the time in the background', () => {
    const { game, storage, wait } = recordingGame();
    startRound(game);
    wait(5000);
    game.send({ type: 'hide' });
    wait(120_000);
    game.send({ type: 'show' });
    wait(3000);
    game.send({ type: 'askEnd' });
    game.send({ type: 'hide' });
    wait(30_000);
    game.send({ type: 'show' });
    wait(2000);
    game.send({ type: 'end' });

    expect(resultsOf(game).elapsedMs).toBe(10_000);
    expect(storedJson(storage, 'ti:rounds')[0].elapsedMs).toBe(10_000);
  });

  it('starts afresh with each round', () => {
    const { game, wait } = recordingGame();
    startRound(game);
    game.send({ type: 'hide' });
    wait(60_000);
    game.send({ type: 'show' });
    endRoundNow(game);
    wait(30_000);

    startRound(game);
    wait(7000);
    endRoundNow(game);

    expect(resultsOf(game).elapsedMs).toBe(7000);
  });
});

describe('personal bests', () => {
  const worldSovereignTen = 'find:flag:world:sovereign:10:normal';

  it('keep the best score of complete rounds per setup and show a new best', () => {
    const { game, storage } = recordingGame();

    playRound(game, {}, 5);
    expect(resultsOf(game).isNewBest).toBe(true);
    playRound(game, {}, 3);
    expect(resultsOf(game).isNewBest).toBe(false);
    startRound(game);
    for (let prompt = 0; prompt < 7; prompt += 1) {
      game.send({ type: 'tap', placeId: promptedPlaceId(game) });
      game.send({ type: 'next' });
    }
    endRoundNow(game);
    expect(resultsOf(game).isNewBest).toBe(false);
    expect(storedJson(storage, 'ti:bests')).toEqual({ [worldSovereignTen]: { score: 5, fastestPerfectMs: null } });

    playRound(game, {}, 8);
    expect(resultsOf(game).isNewBest).toBe(true);
    expect(storedJson(storage, 'ti:bests')).toEqual({ [worldSovereignTen]: { score: 8, fastestPerfectMs: null } });
  });

  it('show no new best for a first round without a right answer', () => {
    const { game, storage } = recordingGame();

    playRound(game, {}, 0);

    expect(resultsOf(game).isNewBest).toBe(false);
    expect(storedJson(storage, 'ti:bests')).toEqual({ [worldSovereignTen]: { score: 0, fastestPerfectMs: null } });
  });

  it('are keyed by mode, variant, region, tier, deck size and Easy mode', () => {
    const { game, storage } = recordingGame();

    playRound(game, {}, 4);
    playRound(game, { variant: 'name' }, 4);
    playRound(game, { region: 'Europe' }, 4);
    playRound(game, { tier: 'dependencies' }, 4);
    playRound(game, { easy: true }, 4);
    playRound(game, { variant: 'both', region: 'Africa', tier: 'defacto', deckSize: 'all', easy: true }, 4);

    expect(Object.keys(storedJson(storage, 'ti:bests')).sort()).toEqual([
      'find:both:Africa:defacto:all:easy',
      'find:flag:Europe:sovereign:10:normal',
      'find:flag:world:dependencies:10:normal',
      'find:flag:world:sovereign:10:easy',
      worldSovereignTen,
      'find:name:world:sovereign:10:normal',
    ]);
  });

  it('keep the fastest perfect round, which also shows as a new best', () => {
    const { game, storage, wait } = recordingGame();
    const playPerfectRound = (secondsPerPrompt: number) => {
      startRound(game);
      for (let prompt = 0; prompt < 10; prompt += 1) {
        wait(secondsPerPrompt * 1000);
        game.send({ type: 'tap', placeId: promptedPlaceId(game) });
        game.send({ type: 'next' });
      }
      return resultsOf(game).isNewBest;
    };

    expect(playPerfectRound(6)).toBe(true);
    expect(playPerfectRound(9)).toBe(false);
    expect(storedJson(storage, 'ti:bests')[worldSovereignTen]).toEqual({ score: 10, fastestPerfectMs: 60_000 });
    expect(playPerfectRound(4)).toBe(true);
    expect(storedJson(storage, 'ti:bests')[worldSovereignTen]).toEqual({ score: 10, fastestPerfectMs: 40_000 });
  });
});

describe('timed rounds', () => {
  const timedRound = (setup: Partial<RoundSetup> = {}, placesInPlay = places) => {
    const { game, storage, wait } = recordingGame(memoryStorage(), placesInPlay);
    startRound(game, { timed: true, ...setup });
    const waitAndTick = (milliseconds: number) => {
      wait(milliseconds);
      game.send({ type: 'tick' });
    };
    return { game, storage, wait, waitAndTick };
  };

  it('end the round like End round when the clock runs out: logged timed and incomplete, never a best', () => {
    const { game, storage, waitAndTick } = timedRound();
    const answeredPlaceIds: string[] = [];
    for (let prompt = 0; prompt < 3; prompt += 1) {
      answeredPlaceIds.push(promptedPlaceId(game));
      game.send({ type: 'tap', placeId: promptedPlaceId(game) });
      game.send({ type: 'next' });
    }

    waitAndTick(79_999);
    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 4 });
    expect(game.timeLeftMs()).toBe(1);

    waitAndTick(250);
    const results = resultsOf(game);
    expect(results).toMatchObject({ score: 3, isComplete: false, isNewBest: false, elapsedMs: 80_000 });
    expect(results.missedPlaceIds).toHaveLength(7);
    expect(game.timeLeftMs()).toBeNull();
    expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ timed: true, complete: false, score: 3, deckSize: 10, elapsedMs: 80_000 })]);
    expect(storedJson(storage, 'ti:bests')).toBeNull();
    expect(Object.keys(storedJson(storage, 'ti:places')['find:flag']).sort()).toEqual(answeredPlaceIds.sort());
    expect(storage.getItem('ti:round')).toBeNull();
  });

  it('keep running while the End round confirm is up, and run out from it', () => {
    const { game, waitAndTick } = timedRound();
    waitAndTick(50_000);
    game.send({ type: 'askEnd' });

    waitAndTick(29_999);
    expect(game.state).toMatchObject({ phase: 'prompt', isConfirmingEnd: true });
    expect(game.timeLeftMs()).toBe(1);

    waitAndTick(1);
    expect(resultsOf(game)).toMatchObject({ score: 0, isComplete: false, answers: [] });
    expect(resultsOf(game).missedPlaceIds).toHaveLength(10);
  });

  it('take no answer once the clock has run out', () => {
    const { game, storage, wait } = timedRound();
    const placeId = promptedPlaceId(game);

    wait(80_000);
    game.send({ type: 'tap', placeId });

    expect(resultsOf(game)).toMatchObject({ score: 0, answers: [], isComplete: false });
    expect(storedJson(storage, 'ti:places')).toBeNull();
  });

  it('finish complete when the clock runs out after the last prompt was answered', () => {
    const { game, storage, waitAndTick } = timedRound();
    for (let prompt = 1; prompt < 10; prompt += 1) {
      game.send({ type: 'tap', placeId: promptedPlaceId(game) });
      game.send({ type: 'next' });
    }
    game.send({ type: 'tap', placeId: someOtherPlaceId(promptedPlaceId(game)) });

    waitAndTick(80_000);

    expect(resultsOf(game)).toMatchObject({ score: 9, isComplete: true, isNewBest: true, missedPlaceIds: [] });
    expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ timed: true, complete: true })]);
  });

  it('combine with Easy mode, and the round log records both', () => {
    const { game, storage } = timedRound({ easy: true });
    expect(game.state).toMatchObject({ phase: 'prompt', attemptsLeft: 3, setup: { timed: true, easy: true } });
    expect(game.timeLeftMs()).toBe(80_000);

    playThrough(game, 10);

    expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ timed: true, easy: true, complete: true, score: 10 })]);
    expect(Object.keys(storedJson(storage, 'ti:bests'))).toEqual(['find:flag:world:sovereign:10:easy']);
  });

  it('share a personal best with untimed rounds of the same setup', () => {
    const { game, storage } = recordingGame();

    playRound(game, {}, 5);
    playRound(game, { timed: true }, 7);
    expect(resultsOf(game).isNewBest).toBe(true);
    playRound(game, {}, 6);
    expect(resultsOf(game).isNewBest).toBe(false);

    expect(storedJson(storage, 'ti:bests')).toEqual({ 'find:flag:world:sovereign:10:normal': { score: 7, fastestPerfectMs: null } });
    expect(storedJson(storage, 'ti:rounds').map(({ timed }: { timed: boolean }) => timed)).toEqual([false, true, false]);
  });

  it('last 8 s per prompt of the real deck', () => {
    const fewSouthAmerica = ({ region, id }: Place) => region !== 'South America' || ['BRA', 'ARG', 'CHL', 'PER', 'COL', 'BOL', 'URY'].includes(id);

    expect(timedRound().game.timeLeftMs()).toBe(80_000);
    expect(timedRound({ deckSize: 'all' }).game.timeLeftMs()).toBe(1_576_000);
    expect(timedRound({ region: 'South America' }, places.filter(fewSouthAmerica)).game.timeLeftMs()).toBe(56_000);
  });

  it('have no clock when untimed or outside a round', () => {
    const { game } = recordingGame();
    expect(game.timeLeftMs()).toBeNull();

    startRound(game);
    expect(game.timeLeftMs()).toBeNull();
  });

  describe('pauses', () => {
    it('stop the countdown until Resume, which continues it', () => {
      const { game, waitAndTick } = timedRound();
      expect(game.state).toMatchObject({ isPaused: false, pausesLeft: 3 });
      waitAndTick(10_000);

      game.send({ type: 'pause' });
      expect(game.state).toMatchObject({ phase: 'prompt', isPaused: true, pausesLeft: 2 });
      waitAndTick(300_000);
      expect(game.timeLeftMs()).toBe(70_000);

      game.send({ type: 'resume' });
      waitAndTick(5000);
      expect(game.state).toMatchObject({ phase: 'prompt', isPaused: false, pausesLeft: 2 });
      expect(game.timeLeftMs()).toBe(65_000);
    });

    it('come three to a round, and a fourth pause does nothing', () => {
      const { game, waitAndTick } = timedRound();
      for (let pause = 0; pause < 3; pause += 1) {
        game.send({ type: 'pause' });
        waitAndTick(60_000);
        game.send({ type: 'resume' });
      }
      expect(game.state).toMatchObject({ isPaused: false, pausesLeft: 0 });

      game.send({ type: 'pause' });
      waitAndTick(1000);

      expect(game.state).toMatchObject({ isPaused: false, pausesLeft: 0 });
      expect(game.timeLeftMs()).toBe(79_000);
    });

    it('take no answer while the round is paused', () => {
      const { game } = timedRound();
      const placeId = promptedPlaceId(game);
      game.send({ type: 'pause' });

      game.send({ type: 'tap', placeId });
      game.send({ type: 'askEnd' });

      expect(game.state).toMatchObject({ phase: 'prompt', placeId, score: 0, isPaused: true, isConfirmingEnd: false });
    });

    it('are used by backgrounding while one is left: the round comes back paused, no time lost', () => {
      const { game, waitAndTick } = timedRound();
      waitAndTick(10_000);

      game.send({ type: 'hide' });
      expect(game.state).toMatchObject({ isPaused: true, pausesLeft: 2 });
      waitAndTick(600_000);
      game.send({ type: 'show' });
      waitAndTick(5000);

      expect(game.state).toMatchObject({ phase: 'prompt', isPaused: true, pausesLeft: 2 });
      expect(game.timeLeftMs()).toBe(70_000);
      game.send({ type: 'resume' });
      waitAndTick(5000);
      expect(game.timeLeftMs()).toBe(65_000);
    });

    it('are not used again by backgrounding a paused round', () => {
      const { game, wait } = timedRound();
      game.send({ type: 'pause' });

      game.send({ type: 'hide' });
      wait(60_000);
      game.send({ type: 'show' });

      expect(game.state).toMatchObject({ isPaused: true, pausesLeft: 2 });
      expect(game.timeLeftMs()).toBe(80_000);
    });

    it('once spent, leave the clock running in the background: the time away is deducted on return', () => {
      const { game, wait } = timedRound();
      spendPauses(game);
      wait(10_000);

      game.send({ type: 'hide' });
      expect(game.state).toMatchObject({ isPaused: false, pausesLeft: 0 });
      wait(30_000);
      game.send({ type: 'show' });

      expect(game.state).toMatchObject({ phase: 'prompt', isPaused: false });
      expect(game.timeLeftMs()).toBe(40_000);
    });

    it('once spent, end the round as a timeout on return when the clock ran out in the background', () => {
      const { game, storage, wait } = timedRound();
      game.send({ type: 'tap', placeId: promptedPlaceId(game) });
      game.send({ type: 'next' });
      spendPauses(game);

      game.send({ type: 'hide' });
      wait(600_000);
      game.send({ type: 'show' });

      expect(resultsOf(game)).toMatchObject({ score: 1, isComplete: false, elapsedMs: 80_000 });
      expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ timed: true, complete: false, pausesUsed: 3 })]);
      expect(storage.getItem('ti:round')).toBeNull();
    });

    it('are counted in the round log', () => {
      const { game, storage, wait } = timedRound();
      game.send({ type: 'pause' });
      game.send({ type: 'resume' });
      game.send({ type: 'hide' });
      wait(1000);
      game.send({ type: 'show' });
      game.send({ type: 'resume' });

      playThrough(game, 10);

      expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ timed: true, complete: true, pausesUsed: 2 })]);
    });

    it('are not used by the End round confirm or the help dialog, which leave the clock running', () => {
      const { game, waitAndTick } = timedRound();
      game.send({ type: 'askEnd' });
      waitAndTick(20_000);
      game.send({ type: 'keepPlaying' });
      expect(game.state).toMatchObject({ isPaused: false, pausesLeft: 3 });
      expect(game.timeLeftMs()).toBe(60_000);

      waitAndTick(20_000);

      expect(game.state).toMatchObject({ isPaused: false, pausesLeft: 3 });
      expect(game.timeLeftMs()).toBe(40_000);
    });

    it('can be taken while the End round confirm is up, which is still up after Resume', () => {
      const { game, waitAndTick } = timedRound();
      game.send({ type: 'askEnd' });
      game.send({ type: 'pause' });
      waitAndTick(60_000);

      game.send({ type: 'resume' });

      expect(game.state).toMatchObject({ phase: 'prompt', isPaused: false, isConfirmingEnd: true, pausesLeft: 2 });
      expect(game.timeLeftMs()).toBe(80_000);
    });

    it('hold a right answer while paused and restart its hold on Resume', () => {
      const { game, waitAndTick } = timedRound();
      game.send({ type: 'tap', placeId: promptedPlaceId(game) });
      game.send({ type: 'pause' });
      waitAndTick(rightAnswerAdvanceMs * 2);
      expect(game.state).toMatchObject({ phase: 'verdict', promptNumber: 1, isPaused: true });

      game.send({ type: 'resume' });
      waitAndTick(rightAnswerAdvanceMs - 1);
      expect(game.state).toMatchObject({ phase: 'verdict', promptNumber: 1 });
      waitAndTick(1);
      expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 2 });
    });

    it('do not exist in untimed rounds', () => {
      const { game, wait } = recordingGame();
      startRound(game);
      expect(game.state).toMatchObject({ isPaused: false, pausesLeft: 0 });

      game.send({ type: 'pause' });
      wait(5000);
      endRoundNow(game);

      expect(resultsOf(game).elapsedMs).toBe(5000);
    });
  });
});

describe('the tier drawn outside a round', () => {
  it('is sovereign until another tier is played, then the deepest tier played so far', () => {
    const { game, storage } = recordingGame();
    expect(deepestTierPlayed(storage)).toBe('sovereign');

    playRound(game, { tier: 'defacto' }, 2);
    expect(deepestTierPlayed(storage)).toBe('defacto');

    game.send({ type: 'leave' });
    startRound(game, { tier: 'dependencies' });
    endRoundNow(game);
    playRound(game, { tier: 'sovereign' }, 2);
    expect(deepestTierPlayed(storage)).toBe('dependencies');
  });
});

describe('storage layout', () => {
  const listedStorage = () => {
    const entries = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: key => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: key => entries.delete(key),
    };
    return { storage, entries };
  };

  it('keeps play in ti:places, ti:rounds and ti:bests next to the remembered setup', () => {
    const { storage, entries } = listedStorage();
    const { game } = recordingGame(storage);

    playRound(game, {}, 10);

    expect([...entries.keys()].sort()).toEqual(['ti:bests', 'ti:meta', 'ti:places', 'ti:rounds', 'ti:setup']);
  });

  it('treats a damaged entry as empty', () => {
    const { storage } = listedStorage();
    storage.setItem('ti:places', 'not json');
    storage.setItem('ti:rounds', '{"not":"a list"}');
    storage.setItem('ti:bests', '[]');
    const { game } = recordingGame(storage);

    expect(deepestTierPlayed(storage)).toBe('sovereign');
    playRound(game, {}, 10);

    expect(Object.keys(storedJson(storage, 'ti:places')['find:flag'])).toHaveLength(10);
    expect(storedJson(storage, 'ti:rounds')).toHaveLength(1);
    expect(resultsOf(game).isNewBest).toBe(true);
  });

  it('stays within the 500 KB budget for a heavy player of every variant', () => {
    const { storage, entries } = listedStorage();
    const { game, wait } = recordingGame(storage);
    const deepestSetup = { region: 'world', tier: 'dependencies', deckSize: 'all' } as const;
    for (const variant of ['flag', 'name', 'both'] as const) {
      for (let round = 0; round < 8; round += 1) playRound(game, { ...deepestSetup, variant }, 0);
      playRound(game, { ...deepestSetup, variant, easy: true }, 0);
    }
    for (let round = 0; round < 1000; round += 1) {
      wait(3_600_000);
      startRound(game, { region: 'North America', tier: 'dependencies', deckSize: 'all' });
      wait(3_600_000);
      endRoundNow(game);
    }

    const totalSize = [...entries].reduce((size, [key, value]) => size + key.length + value.length, 0);
    expect(Object.values(storedJson(storage, 'ti:places')['find:name']).every(record => (record as { recent: unknown[] }).recent.length === 8)).toBe(true);
    expect(totalSize).toBeLessThan(500_000);
  }, 20_000);
});

describe('storage migration on boot', () => {
  const record = (seen: number, correct: number, recent: (0 | 1)[]) => ({ seen, correct, recent, easySeen: 0, easyCorrect: 0 });

  const bootWith = (stored: Record<string, unknown>, version: object, { schemaMigrations, bootPlaces = places }: { schemaMigrations?: SchemaMigration[], bootPlaces?: Place[] } = {}) => {
    const storage = memoryStorage();
    Object.entries(stored).forEach(([key, value]) => storage.setItem(key, JSON.stringify(value)));
    createGame({ places: bootPlaces, version: { ...shippedVersion, ...version }, random: seededRandom(1), clock: () => Date.UTC(2026, 10, 17), storage, schemaMigrations });
    const read = (key: string) => JSON.parse(storage.getItem(key) ?? 'null');
    return { storage, read };
  };

  it('only stamps ti:meta on a first launch', () => {
    const { storage, read } = bootWith({}, { dataVersion: 4, idMoves: { 4: { AAA: 'BBB' } } });
    expect(read('ti:meta')).toEqual({ schema: 3, dataVersion: 4 });
    expect(storage.getItem('ti:places')).toBeNull();
  });

  it('leaves everything alone when the data version is current', () => {
    const stored = { 'ti:meta': { schema: 1, dataVersion: 3 }, 'ti:places': { 'find:flag': { AAA: record(2, 1, [1, 0]) } } };
    const { read } = bootWith(stored, { dataVersion: 3, idMoves: { 3: { AAA: 'BBB' } } });
    expect(read('ti:places')).toEqual(stored['ti:places']);
  });

  it('moves a renamed id, remaps confusedWith and stamps the new version', () => {
    const { read } = bootWith({
      'ti:meta': { schema: 1, dataVersion: 1 },
      'ti:places': { 'find:flag': { AAA: record(2, 1, [1, 0]), CCC: { ...record(1, 0, [0]), confusedWith: 'AAA' } } },
    }, { dataVersion: 2, idMoves: { 2: { AAA: 'BBB' } } });
    expect(read('ti:places')).toEqual({ 'find:flag': { BBB: record(2, 1, [1, 0]), CCC: { ...record(1, 0, [0]), confusedWith: 'BBB' } } });
    expect(read('ti:meta')).toEqual({ schema: 3, dataVersion: 2 });
  });

  it('merges records per mode and variant: counters summed, the longer recent kept', () => {
    const { read } = bootWith({
      'ti:meta': { schema: 1, dataVersion: 1 },
      'ti:places': {
        'find:flag': { AAA: record(3, 2, [1, 1, 0]), BBB: record(2, 1, [0, 1]) },
        'find:name': { AAA: record(1, 1, [1]) },
      },
    }, { dataVersion: 2, idMoves: { 2: { AAA: 'BBB' } } });
    const merged = read('ti:places');
    expect(merged['find:flag']).toEqual({ BBB: record(5, 3, [1, 1, 0]) });
    expect(merged['find:name']).toEqual({ BBB: record(1, 1, [1]) });
  });

  it('adds easy counters when merging and drops a confusedWith that points at itself', () => {
    const { read } = bootWith({
      'ti:meta': { schema: 1, dataVersion: 1 },
      'ti:places': { 'find:flag': { AAA: { ...{ ...record(1, 1, [1]), confusedWith: 'BBB' }, easySeen: 2, easyCorrect: 1 }, BBB: { ...record(0, 0, []), easySeen: 3, easyCorrect: 3 } } },
    }, { dataVersion: 2, idMoves: { 2: { AAA: 'BBB' } } });
    expect(read('ti:places')['find:flag']).toEqual({ BBB: { seen: 1, correct: 1, recent: [1], easySeen: 5, easyCorrect: 4 } });
  });

  it('applies every missed version in order, skipping versions already stored', () => {
    const { read } = bootWith({
      'ti:meta': { schema: 1, dataVersion: 1 },
      'ti:places': { 'find:flag': { AAA: record(1, 1, [1]), XXX: record(4, 4, [1, 1, 1, 1]) } },
    }, { dataVersion: 4, idMoves: { 1: { XXX: 'ZZZ' }, 2: { AAA: 'BBB' }, 3: { BBB: 'CCC' } } });
    expect(Object.keys(read('ti:places')['find:flag'])).toEqual(['CCC', 'XXX']);
  });

  it('leaves a split\'s old record untouched as a hidden orphan: the id has no target and is not a current place', () => {
    const stored = { 'ti:meta': { schema: 1, dataVersion: 1 }, 'ti:places': { 'find:flag': { DEU: record(3, 3, [1, 1, 1]), FRA: record(2, 1, [0, 1]) } } };
    const withoutSplitPlace = places.filter(({ id }) => id !== 'DEU');
    const storage = memoryStorage();
    Object.entries(stored).forEach(([key, value]) => storage.setItem(key, JSON.stringify(value)));
    const game = createGame({ places: withoutSplitPlace, version: { ...shippedVersion, dataVersion: 2, idMoves: {} }, random: seededRandom(1), clock: () => 0, storage });
    expect(JSON.parse(storage.getItem('ti:places')!)).toEqual(stored['ti:places']);
    expect(JSON.parse(storage.getItem('ti:meta')!).dataVersion).toBe(2);
    expect(game.poolOf({ ...game.setupFor('find'), tier: 'dependencies' })).not.toContain('DEU');
  });

  it('keeps the records of a removed place across versions, and they are back in effect when the id returns', () => {
    const stored = { 'ti:meta': { schema: 1, dataVersion: 1 }, 'ti:places': { 'find:flag': { DEU: record(3, 3, [1, 1, 1]) } } };
    const withoutPlace = places.filter(({ id }) => id !== 'DEU');
    const storage = memoryStorage();
    Object.entries(stored).forEach(([key, value]) => storage.setItem(key, JSON.stringify(value)));
    createGame({ places: withoutPlace, version: { ...shippedVersion, dataVersion: 2, idMoves: {} }, random: seededRandom(1), clock: () => 0, storage });
    createGame({ places: withoutPlace, version: { ...shippedVersion, dataVersion: 3, idMoves: {} }, random: seededRandom(1), clock: () => 0, storage });
    expect(JSON.parse(storage.getItem('ti:places')!)).toEqual(stored['ti:places']);
    const game = createGame({ places, version: { ...shippedVersion, dataVersion: 4, idMoves: {} }, random: seededRandom(1), clock: () => 0, storage });
    expect(game.poolOf({ ...game.setupFor('find'), tier: 'dependencies' })).toContain('DEU');
    expect(JSON.parse(storage.getItem('ti:places')!)).toEqual(stored['ti:places']);
  });

  it('changes nothing stored for added, renamed, re-tiered or re-regioned places', () => {
    const stored = { 'ti:meta': { schema: 1, dataVersion: 1 }, 'ti:places': { 'find:flag': { DEU: record(3, 3, [1, 1, 1]) } }, 'ti:round': null };
    const changedPlaces: Place[] = [
      ...places.map(place => (place.id === 'DEU' ? { ...place, tier: 'dependencies' as const, region: 'Asia' as const } : place)),
      { id: 'NEW', tier: 'sovereign', region: 'Europe', flag: null },
    ];
    const { read } = bootWith(stored, { dataVersion: 2, idMoves: {} }, { bootPlaces: changedPlaces });
    expect(read('ti:places')).toEqual(stored['ti:places']);
  });

  it('remaps the stored round\'s deck, answers and wrong taps by idMoves', () => {
    const round = {
      setup: { mode: 'find', variant: 'flag', region: 'world', tier: 'sovereign', deckSize: 10, easy: true },
      deck: ['AAA', 'FRA', 'DEU', 'ITA', 'ESP'],
      promptIndex: 1,
      answers: [{ placeId: 'AAA', tappedPlaceId: 'AAA', outcome: 'right' }],
      wrongTapPlaceIds: ['AAA'],
      startedAt: 1,
      hiddenAt: null,
      backgroundMs: 0,
      dataVersion: 1,
    };
    const { read } = bootWith({ 'ti:meta': { schema: 1, dataVersion: 1 }, 'ti:round': round }, { dataVersion: 2, idMoves: { 2: { AAA: 'GBR' } } }, { bootPlaces: places.concat({ id: 'GBR', tier: 'sovereign', region: 'Europe', flag: null }) });
    expect(read('ti:round').deck).toEqual(['GBR', 'FRA', 'DEU', 'ITA', 'ESP']);
    expect(read('ti:round').answers[0]).toEqual({ placeId: 'GBR', tappedPlaceId: 'GBR', outcome: 'right' });
    expect(read('ti:round').wrongTapPlaceIds).toEqual(['GBR']);
  });

  it('does not touch bests, daily records, rounds or setups', () => {
    const untouched = {
      'ti:bests': { 'find:flag:world:sovereign:10:normal': { score: 9, fastestPerfectMs: null } },
      'ti:daily': { '2026-11-16': { date: '2026-11-16', variant: 'flag', score: 8, deckSize: 10, elapsedMs: 1000, complete: true } },
      'ti:rounds': [{ dataVersion: 1 }],
      'ti:setup': { lastMode: 'find', setups: {} },
    };
    const { read } = bootWith({ 'ti:meta': { schema: 1, dataVersion: 1 }, ...untouched }, { dataVersion: 2, idMoves: { 2: { AAA: 'BBB' } } });
    Object.entries(untouched).forEach(([key, value]) => expect(read(key)).toEqual(value));
  });

  it('runs the ordered schema migrations that were missed and stamps the new schema', () => {
    const order: string[] = [];
    const schemaMigrations = [
      () => order.push('1 to 2'),
      (migratedStorage: KeyValueStorage) => {
        order.push('2 to 3');
        migratedStorage.setItem('ti:setup', 'migrated');
      },
    ];
    const { read, storage } = bootWith({ 'ti:meta': { schema: 2, dataVersion: 1 } }, { dataVersion: 1 }, { schemaMigrations });
    expect(order).toEqual(['2 to 3']);
    expect(storage.getItem('ti:setup')).toBe('migrated');
    expect(read('ti:meta')).toEqual({ schema: 3, dataVersion: 1 });
  });

  it('runs every schema migration from the first schema, and none on a first launch', () => {
    const order: string[] = [];
    const schemaMigrations = [() => order.push('1 to 2'), () => order.push('2 to 3')];
    bootWith({ 'ti:meta': { schema: 1, dataVersion: 1 } }, { dataVersion: 1 }, { schemaMigrations });
    expect(order).toEqual(['1 to 2', '2 to 3']);
    order.length = 0;
    bootWith({}, { dataVersion: 1 }, { schemaMigrations });
    expect(order).toEqual([]);
  });

  it('makes the remembered setups and the stored round from before timed rounds untimed', () => {
    const setupBeforeTimed = { mode: 'find', variant: 'name', region: 'Europe', tier: 'defacto', deckSize: 'all', easy: true };
    const roundBeforeTimed = { setup: { ...setupBeforeTimed, deckSize: 10 }, deck: ['FRA', 'DEU', 'ITA', 'ESP', 'PRT'], promptIndex: 0, answers: [], wrongTapPlaceIds: [], startedAt: 1, hiddenAt: null, backgroundMs: 0, dataVersion: shippedVersion.dataVersion };
    const storage = memoryStorage();
    storage.setItem('ti:meta', JSON.stringify({ schema: 1, dataVersion: shippedVersion.dataVersion }));
    storage.setItem('ti:setup', JSON.stringify({ lastMode: 'find', setups: { find: setupBeforeTimed } }));
    storage.setItem('ti:round', JSON.stringify(roundBeforeTimed));

    const game = createGame({ places, version: shippedVersion, random: seededRandom(1), clock: () => 2, storage });

    expect(game.setupFor('find')).toEqual({ ...setupBeforeTimed, timed: false });
    expect(game.state).toMatchObject({ phase: 'prompt', placeId: 'FRA', setup: { deckSize: 10, timed: false } });
    expect(JSON.parse(storage.getItem('ti:meta')!).schema).toBe(3);
  });

  it('carries a stored round from before pauses over with no pause used, and applies the pause rules to it', () => {
    const roundBeforePauses = { setup: { ...firstTimeSetup, timed: true }, deck: ['FRA', 'DEU', 'ITA', 'ESP', 'PRT'], promptIndex: 0, answers: [], wrongTapPlaceIds: [], startedAt: 1000, hiddenAt: 11_000, backgroundMs: 2000, dataVersion: shippedVersion.dataVersion };
    const storage = memoryStorage();
    storage.setItem('ti:meta', JSON.stringify({ schema: 2, dataVersion: shippedVersion.dataVersion }));
    storage.setItem('ti:round', JSON.stringify(roundBeforePauses));

    const game = createGame({ places, version: shippedVersion, random: seededRandom(1), clock: () => 500_000, storage });

    expect(game.state).toMatchObject({ phase: 'prompt', placeId: 'FRA', isPaused: true, pausesLeft: 2 });
    expect(game.timeLeftMs()).toBe(32_000);
    expect(JSON.parse(storage.getItem('ti:round')!)).not.toHaveProperty('backgroundMs');
  });
});

describe('resuming an interrupted round', () => {
  let now = Date.UTC(2026, 10, 17);
  const clock = () => now;
  const boot = (storage: KeyValueStorage, version: DataVersion = shippedVersion) => createGame({ places, version, random: seededRandom(1), clock, storage });
  const easySetup: RoundSetup = { mode: 'find', variant: 'flag', region: 'world', tier: 'sovereign', deckSize: 10, easy: true, timed: false };

  it('returns to the same prompt with the answers so far after a relaunch', () => {
    const storage = memoryStorage();
    const game = boot(storage);
    game.send({ type: 'start', setup: game.setupFor('find') });
    const askedPlaceIds: string[] = [];
    for (const isRight of [true, false]) {
      const placeId = promptedPlaceId(game);
      askedPlaceIds.push(placeId);
      game.send({ type: 'tap', placeId: isRight ? placeId : someOtherPlaceId(placeId) });
      game.send({ type: 'next' });
    }
    const before = game.state;
    expect(storage.getItem('ti:round')).not.toBeNull();

    const resumed = boot(storage);
    expect(resumed.state).toEqual(before);
    expect(resumed.state).toMatchObject({ phase: 'prompt', promptNumber: 3, score: 1, progress: expect.arrayContaining(['right', 'wrong', 'current']) });
  });

  it('restores easy-mode tries left and tapped places', () => {
    const storage = memoryStorage();
    const game = boot(storage);
    game.send({ type: 'start', setup: easySetup });
    const placeId = promptedPlaceId(game);
    game.send({ type: 'tap', placeId: someOtherPlaceId(placeId) });
    expect(boot(storage).state).toMatchObject({ phase: 'prompt', attemptsLeft: 2, wrongTapPlaceIds: [someOtherPlaceId(placeId)] });
  });

  it('writes the round on hide and carries the time spent away into the elapsed time', () => {
    const storage = memoryStorage();
    now = 1_000_000;
    const game = boot(storage);
    game.send({ type: 'start', setup: { ...easySetup, easy: false, deckSize: 10 } });
    now += 10_000;
    game.send({ type: 'hide' });
    expect(JSON.parse(storage.getItem('ti:round')!)).toMatchObject({ startedAt: 1_000_000, hiddenAt: 1_010_000 });
    now += 60_000;
    const resumed = boot(storage);
    now += 5_000;
    resumed.send({ type: 'askEnd' });
    resumed.send({ type: 'end' });
    expect(resultsOf(resumed as RoundGame).elapsedMs).toBe(15_000);
  });

  describe('when timed', () => {
    const timedSetup: RoundSetup = { ...easySetup, easy: false, timed: true };

    const startTimed = (storage: KeyValueStorage) => {
      now = 1_000_000;
      const game = boot(storage);
      game.send({ type: 'start', setup: timedSetup });
      return game;
    };

    it('keeps the pauses used and the moment it was hidden, and comes back paused with no time lost', () => {
      const storage = memoryStorage();
      const game = startTimed(storage);
      now += 10_000;
      game.send({ type: 'hide' });
      expect(JSON.parse(storage.getItem('ti:round')!)).toMatchObject({ pausesUsed: 1, hiddenAt: 1_010_000 });
      now += 3_600_000;

      const resumed = boot(storage);

      expect(resumed.state).toMatchObject({ phase: 'prompt', isPaused: true, pausesLeft: 2 });
      expect(resumed.timeLeftMs()).toBe(70_000);
      resumed.send({ type: 'resume' });
      now += 5000;
      expect(resumed.timeLeftMs()).toBe(65_000);
    });

    it('comes back paused after a relaunch it was not hidden for, using a pause from its last answer', () => {
      const storage = memoryStorage();
      const game = startTimed(storage);
      now += 3000;
      game.send({ type: 'tap', placeId: promptedPlaceId(game as RoundGame) });
      now += 3_600_000;

      const resumed = boot(storage);

      expect(resumed.state).toMatchObject({ phase: 'prompt', promptNumber: 2, isPaused: true, pausesLeft: 2 });
      expect(resumed.timeLeftMs()).toBe(77_000);
    });

    it('with no pause left, deducts the time away since it was hidden', () => {
      const storage = memoryStorage();
      const game = startTimed(storage);
      spendPauses(game);
      now += 10_000;
      game.send({ type: 'hide' });
      now += 30_000;

      const resumed = boot(storage);

      expect(resumed.state).toMatchObject({ phase: 'prompt', isPaused: false, pausesLeft: 0 });
      expect(resumed.timeLeftMs()).toBe(40_000);
    });

    it('with no pause left, ends as a timeout when the clock ran out while away, logging the pauses used', () => {
      const storage = memoryStorage();
      const game = startTimed(storage);
      game.send({ type: 'tap', placeId: promptedPlaceId(game as RoundGame) });
      game.send({ type: 'next' });
      spendPauses(game);
      game.send({ type: 'hide' });
      now += 600_000;

      const resumed = boot(storage);

      expect(resultsOf(resumed as RoundGame)).toMatchObject({ score: 1, isComplete: false, elapsedMs: 80_000 });
      expect(JSON.parse(storage.getItem('ti:rounds')!)).toEqual([expect.objectContaining({ timed: true, complete: false, pausesUsed: 3 })]);
      expect(storage.getItem('ti:round')).toBeNull();
    });
  });

  it('continues a verdict by moving on to the next prompt', () => {
    const storage = memoryStorage();
    const game = boot(storage);
    game.send({ type: 'start', setup: game.setupFor('find') });
    const placeId = promptedPlaceId(game);
    game.send({ type: 'tap', placeId: someOtherPlaceId(placeId) });
    expect(game.state.phase).toBe('verdict');
    expect(boot(storage).state).toMatchObject({ phase: 'prompt', promptNumber: 2, score: 0 });
  });

  it('deletes the stored round on End round and on completion', () => {
    const storage = memoryStorage();
    const game = boot(storage);
    game.send({ type: 'start', setup: game.setupFor('find') });
    game.send({ type: 'askEnd' });
    game.send({ type: 'end' });
    expect(storage.getItem('ti:round')).toBeNull();
    game.send({ type: 'leave' });
    game.send({ type: 'start', setup: game.setupFor('find') });
    playThrough(game as RoundGame, 10);
    expect(storage.getItem('ti:round')).toBeNull();
    expect(boot(storage).state.phase).toBe('home');
  });

  it('resumes the remapped deck after an id move', () => {
    const storage = memoryStorage();
    const game = boot(storage);
    game.send({ type: 'start', setup: game.setupFor('find') });
    const firstPlaceId = promptedPlaceId(game);
    const movedTo = places.find(({ id, tier }) => tier === 'sovereign' && id !== firstPlaceId && !JSON.parse(storage.getItem('ti:round')!).deck.includes(id))!.id;
    const version = { dataVersion: shippedVersion.dataVersion + 1, idMoves: { [shippedVersion.dataVersion + 1]: { [firstPlaceId]: movedTo } } };
    const resumed = boot(storage, version);
    expect(resumed.state).toMatchObject({ phase: 'prompt', promptNumber: 1, placeId: movedTo });
  });

  it('starts at home when the stored round is damaged', () => {
    const storage = memoryStorage();
    storage.setItem('ti:round', '{"deck":["XXX"]}');
    expect(boot(storage).state.phase).toBe('home');
    expect(storage.getItem('ti:round')).toBeNull();
  });
});
