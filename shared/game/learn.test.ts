import { describe, expect, it } from 'vitest';
import shippedNames from '../../public/data/names.json';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame, isTypedMode } from './game';
import type { Game, GameState, KeyValueStorage, Place, RoundSetup } from './game';
import type { NamesFile, PlaceNames } from './matcher';
import type { PlaceRecord } from './records';

const allPlaces = shippedPlaces as Place[];
const fiveOceaniaPlaceIds = ['AUS', 'NZL', 'FJI', 'PNG', 'WSM'];
const fiveOceaniaPlaces = allPlaces.filter(({ id, region, tier }) => region !== 'Oceania' || tier !== 'sovereign' || fiveOceaniaPlaceIds.includes(id));
const names = shippedNames as NamesFile;
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

const now = Date.UTC(2026, 10, 18, 9);

const boot = (storage: KeyValueStorage = memoryStorage(), places: Place[] = allPlaces) => createGame({ places, names, version: shippedVersion, random: seededRandom(5), clock: () => now, storage });

const learnEurope: RoundSetup = { mode: 'find', variant: 'name', region: 'Europe', tier: 'sovereign', deckSize: 10, easy: false, timed: false, roundKind: 'learn' };
const learnOceania: RoundSetup = { ...learnEurope, region: 'Oceania' };

const promptOf = (game: Game) => {
  const { state } = game;
  if (state.phase !== 'prompt') throw new Error(`Expected a prompt, got ${state.phase}`);
  return state;
};

const verdictOf = (game: Game) => {
  const { state } = game;
  if (state.phase !== 'verdict') throw new Error(`Expected a verdict, got ${state.phase}`);
  return state;
};

const resultsOf = (game: Game) => {
  const { state } = game;
  if (state.phase !== 'results') throw new Error(`Expected results, got ${state.phase}`);
  return state;
};

const someOtherPlaceId = (placeId: string) => (placeId === 'DEU' ? 'FRA' : 'DEU');

const answer = (game: Game, mark: string, answeredInstead?: string) => {
  const { placeId, setup, optionPlaceIds } = promptOf(game);
  const isPicked = setup.easy && isTypedMode(setup.mode);
  const answeredId = mark === right ? placeId : answeredInstead ?? (isPicked ? optionPlaceIds.find(id => id !== placeId)! : someOtherPlaceId(placeId));
  if (isPicked) game.send({ type: 'pick', placeId: answeredId });
  else if (isTypedMode(setup.mode)) game.send({ type: 'submit', text: (names[answeredId] as PlaceNames).en.name });
  else game.send({ type: 'tap', placeId: answeredId });
  return placeId;
};

const play = (game: Game, marks: string) => [...marks].map((mark) => {
  const placeId = answer(game, mark);
  game.send({ type: 'next' });
  return placeId;
});

const playAllRight = (game: Game, count: number) => play(game, right.repeat(count));

const startLearning = (setup: RoundSetup, storage?: KeyValueStorage, places?: Place[]) => {
  const game = boot(storage, places);
  game.send({ type: 'start', setup });
  return game;
};

const record = (recent: (0 | 1)[]): PlaceRecord => ({ seen: recent.length, correct: recent.filter(Boolean).length, recent, easySeen: 0, easyCorrect: 0 });

const storageWithRecords = (byPlaceId: Record<string, (0 | 1)[]>) => {
  const storage = memoryStorage();
  storage.setItem('ti:places', JSON.stringify({ 'find:name': Object.fromEntries(Object.entries(byPlaceId).map(([placeId, recent]) => [placeId, record(recent)])) }));
  return storage;
};

const placeRecordOf = (storage: KeyValueStorage, placeId: string, modeVariant = 'find:name'): PlaceRecord => JSON.parse(storage.getItem('ti:places')!)[modeVariant][placeId];

const learningOf = (state: GameState) => ('learning' in state ? state.learning : undefined);

describe('Learn in the setup', () => {
  it('counts the whole pool and is available from 5 places', () => {
    const game = boot(memoryStorage(), fiveOceaniaPlaces);

    expect(game.choicesFor(learnOceania).roundKinds).toContainEqual({ value: 'learn', count: 5, isAvailable: true });
    expect(game.choicesFor(learnOceania).playCount).toBe(5);
    expect(game.choicesFor(learnEurope).playCount).toBe(46);
  });

  it('is shown with its count but unavailable under 5 places, and cannot be started', () => {
    const fourOceaniaPlaces = fiveOceaniaPlaces.filter(({ id }) => id !== 'WSM');
    const game = boot(memoryStorage(), fourOceaniaPlaces);

    expect(game.choicesFor(learnOceania).roundKinds).toContainEqual({ value: 'learn', count: 4, isAvailable: false });
    game.send({ type: 'start', setup: learnOceania });
    expect(game.state.phase).toBe('home');
  });

  it('is untimed whatever the Timed switch says, and is remembered for the mode', () => {
    const game = startLearning({ ...learnEurope, timed: true });

    expect(promptOf(game).setup).toMatchObject({ roundKind: 'learn', timed: false });
    expect(game.timeLeftMs()).toBeNull();
    expect(game.setupFor('find')).toMatchObject({ roundKind: 'learn', region: 'Europe' });
  });

  it('applies Easy mode', () => {
    const game = startLearning({ ...learnEurope, easy: true });
    game.send({ type: 'tap', placeId: 'DEU' });

    expect(promptOf(game)).toMatchObject({ placeId: 'RUS', attemptsLeft: 2 });
  });
});

describe('ease order', () => {
  it('starts with the most populous places and asks each new place once while every answer is right', () => {
    const game = startLearning({ ...learnEurope, region: 'world' });

    const asked = playAllRight(game, 40);

    expect(asked.slice(0, 5)).toEqual(['CHN', 'IND', 'USA', 'IDN', 'PAK']);
    expect(new Set(asked).size).toBe(40);
  });

  it('puts microstates last in Find on the map and Name on the map', () => {
    const asked = playAllRight(startLearning(learnEurope), 46);

    expect(asked.slice(0, 3)).toEqual(['RUS', 'DEU', 'FRA']);
    expect(asked.slice(-6)).toEqual(['MLT', 'AND', 'MCO', 'LIE', 'SMR', 'VAT']);
    expect(asked.indexOf('ISL')).toBeLessThan(asked.indexOf('MLT'));
    expect(playAllRight(startLearning({ ...learnEurope, mode: 'name', variant: 'map' }), 46).slice(-6)).toEqual(['MLT', 'AND', 'MCO', 'LIE', 'SMR', 'VAT']);
  });

  it('keeps microstates in plain ease order in other modes', () => {
    const asked = playAllRight(startLearning({ ...learnEurope, mode: 'capital', variant: 'map', easy: true }), 46);

    expect(asked.indexOf('MLT')).toBeLessThan(asked.indexOf('ISL'));
    expect(asked.at(-1)).toBe('VAT');
  });

  it('ranks the places without a population figure last', () => {
    const setup: RoundSetup = { ...learnEurope, tier: 'defacto', mode: 'capital', variant: 'map', easy: true };
    const game = startLearning(setup);

    const asked = playAllRight(game, game.poolOf(setup).length);

    expect(asked.slice(-2)).toEqual(['VAT', 'B36']);
  });
});

describe('the working set', () => {
  it('fills with weak and shaky places first, then unplayed ones, in ease order, and skips solid places', () => {
    const storage = storageWithRecords({ NZL: [0, 0, 0], FJI: [1, 1, 0], AUS: [1, 1, 1] });

    const asked = playAllRight(startLearning(learnOceania, storage, fiveOceaniaPlaces), 4);

    expect(asked).toEqual(['NZL', 'FJI', 'PNG', 'WSM']);
  });

  it('lets a new place join only when no miss is waiting and fewer than 4 misses are in play', () => {
    const asked = play(startLearning(learnEurope), '✗✗✗✓✓✓✗✓✓✓');

    expect(asked).toEqual(['RUS', 'DEU', 'FRA', 'RUS', 'DEU', 'FRA', 'GBR', 'RUS', 'ITA', 'GBR']);
  });
});

describe('the miss queue', () => {
  it('brings a miss back 3 prompts later, then 6 later, and clears it after 2 right answers in a row', () => {
    const game = startLearning(learnEurope);

    const asked = play(game, '✗✓✓✓✓✓✓✓✓✓');
    const learnedAfterClearing = learningOf(game.state)?.learnedCount;
    const askedAfterClearing = playAllRight(game, 20);

    expect(asked).toEqual(['RUS', 'DEU', 'FRA', 'RUS', 'GBR', 'ITA', 'ESP', 'UKR', 'POL', 'RUS']);
    expect(learnedAfterClearing).toBe(8);
    expect(askedAfterClearing).not.toContain('RUS');
  });

  it('starts over when a miss comes back wrong', () => {
    const asked = play(startLearning(learnEurope), '✗✓✓✗✓✓✓✓✓✓✓✓✓');

    expect(asked.map((placeId, index) => (placeId === 'RUS' ? index + 1 : null)).filter(Boolean)).toEqual([1, 4, 7, 13]);
  });

  it('does not count a place as learned until it is cleared', () => {
    const game = startLearning(learnEurope);

    play(game, '✗✓✓');
    answer(game, right);

    expect(verdictOf(game)).toMatchObject({ placeId: 'RUS', learning: { learnedCount: 2 } });
  });
});

describe('the pool exhausted', () => {
  const storageWithSolidPlaces = () => storageWithRecords({ NZL: [0, 0, 0], FJI: [1, 1, 0], AUS: [1, 1, 1, 1, 1], PNG: [1, 1, 1, 1, 0] });

  it('continues with solid places, lowest recent score first, and says "Everything here learned" once', () => {
    const game = startLearning(learnOceania, storageWithSolidPlaces(), fiveOceaniaPlaces);

    const learned = playAllRight(game, 3);
    const firstReview = promptOf(game);
    const reviewed = playAllRight(game, 1);
    const secondReview = promptOf(game);

    expect(learned).toEqual(['NZL', 'FJI', 'WSM']);
    expect(firstReview).toMatchObject({ placeId: 'PNG', learning: { isEverythingLearned: true, learnedCount: 3 } });
    expect(reviewed).toEqual(['PNG']);
    expect(secondReview).toMatchObject({ placeId: 'AUS', learning: { isEverythingLearned: false } });
  });

  it('lets no new place join and keeps bringing misses back', () => {
    const game = startLearning(learnOceania, storageWithSolidPlaces(), fiveOceaniaPlaces);
    playAllRight(game, 3);

    const asked = play(game, '✗✓✓✓✓');

    expect(asked[0]).toBe('PNG');
    expect(asked[3]).toBe('PNG');
    expect(asked.every(placeId => fiveOceaniaPlaceIds.includes(placeId))).toBe(true);
    expect(learningOf(game.state)).toMatchObject({ isEverythingLearned: false });
  });

  it('says "Everything here learned" on the first prompt when every place is already solid', () => {
    const storage = storageWithRecords(Object.fromEntries(fiveOceaniaPlaceIds.map(placeId => [placeId, [1, 1, 1]])));

    const game = startLearning(learnOceania, storage, fiveOceaniaPlaces);

    expect(promptOf(game)).toMatchObject({ learning: { isEverythingLearned: true } });
  });
});

describe('recording a learning round', () => {
  it('feeds the counters from the first answer to each place only', () => {
    const storage = memoryStorage();
    const game = startLearning(learnEurope, storage);

    play(game, '✗✓✓✓✓✓✓✓✓✓');

    expect(placeRecordOf(storage, 'RUS')).toMatchObject({ seen: 1, correct: 0, recent: [0] });
    expect(placeRecordOf(storage, 'DEU')).toMatchObject({ seen: 1, correct: 1, recent: [1] });
  });

  it('updates confusedWith on every miss, repeats included', () => {
    const storage = memoryStorage();
    const game = startLearning(learnEurope, storage);

    answer(game, '✗', 'POL');
    game.send({ type: 'next' });
    play(game, '✓✓');
    answer(game, '✗', 'UKR');

    expect(placeRecordOf(storage, 'RUS')).toMatchObject({ seen: 1, correct: 0, recent: [0], confusedWith: 'UKR' });
  });

  it('feeds the easy counters under Easy mode', () => {
    const storage = memoryStorage();
    const game = startLearning({ ...learnEurope, easy: true }, storage);

    play(game, '✓');

    expect(placeRecordOf(storage, 'RUS')).toMatchObject({ seen: 0, easySeen: 1, easyCorrect: 1 });
  });

  it('ends on End round without a confirm, logged complete as a learning round, with no personal best', () => {
    const storage = memoryStorage();
    const game = startLearning(learnEurope, storage);
    play(game, '✗✓✓✓');

    game.send({ type: 'askEnd' });

    expect(resultsOf(game)).toMatchObject({ isComplete: true, isNewBest: false });
    expect(JSON.parse(storage.getItem('ti:rounds')!)).toEqual([expect.objectContaining({ mode: 'find', learn: true, complete: true, timed: false, deckSize: 3, score: 2 })]);
    expect(storage.getItem('ti:bests')).toBeNull();
    expect(storage.getItem('ti:round')).toBeNull();
  });
});

describe('learning results', () => {
  it('show places learned, answers given and one cell per place asked, coloured by its first answer', () => {
    const game = startLearning(learnEurope);
    play(game, '✗✓✓✓✓');
    answer(game, '✗');

    game.send({ type: 'askEnd' });

    expect(resultsOf(game)).toMatchObject({
      deckSize: 5,
      score: 3,
      missedPlaceIds: [],
      learning: { learnedCount: 3, answerCount: 6 },
      answers: [
        { placeId: 'RUS', outcome: 'wrong' },
        { placeId: 'DEU', outcome: 'right' },
        { placeId: 'FRA', outcome: 'right' },
        { placeId: 'GBR', outcome: 'right' },
        { placeId: 'ITA', outcome: 'wrong' },
      ],
    });
  });

  it('play again as the same learning setup', () => {
    const game = startLearning(learnEurope);
    game.send({ type: 'askEnd' });

    game.send({ type: 'start', setup: resultsOf(game).setup });

    expect(promptOf(game)).toMatchObject({ placeId: 'RUS', learning: { learnedCount: 0 } });
  });
});

describe('resuming a learning round', () => {
  const script = '✗✗✓✓✗✓✓';
  const continuation = '✓✗✓✓✓✓✓✓✓✓✓✓';

  it('comes back with the working set and miss queue intact', () => {
    const uninterrupted = startLearning(learnEurope);
    const storage = memoryStorage();
    const interrupted = startLearning(learnEurope, storage);
    play(uninterrupted, script);
    play(interrupted, script);

    const resumed = boot(storage);

    expect(resumed.state).toEqual(uninterrupted.state);
    expect(play(resumed, continuation)).toEqual(play(uninterrupted, continuation));
  });

  it('moves on from an answered prompt to the prompt it would have asked next', () => {
    const uninterrupted = startLearning(learnEurope);
    const storage = memoryStorage();
    const interrupted = startLearning(learnEurope, storage);
    for (const game of [uninterrupted, interrupted]) {
      play(game, script);
      answer(game, '✗');
    }
    uninterrupted.send({ type: 'next' });

    const resumed = boot(storage);

    expect(resumed.state).toEqual(uninterrupted.state);
    expect(play(resumed, continuation)).toEqual(play(uninterrupted, continuation));
  });

  it('is dropped when its stored loop is damaged', () => {
    const storage = memoryStorage();
    play(startLearning(learnEurope, storage), script);
    const stored = JSON.parse(storage.getItem('ti:round')!);
    storage.setItem('ti:round', JSON.stringify({ ...stored, learning: { ...stored.learning, misses: [{ placeId: 'NOPE', dueAt: 3, rightsInARow: 0 }] } }));

    expect(boot(storage).state).toEqual({ phase: 'home' });
  });
});
