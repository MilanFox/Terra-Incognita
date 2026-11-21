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

const easiestFirst = () => 0;

const boot = (storage: KeyValueStorage = memoryStorage(), places: Place[] = allPlaces, random: () => number = easiestFirst) => createGame({ places, names, version: shippedVersion, random, clock: () => now, storage });

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

const startLearningWith = (random: () => number, setup: RoundSetup, storage: KeyValueStorage = memoryStorage()) => {
  const game = boot(storage, allPlaces, random);
  game.send({ type: 'start', setup });
  return game;
};

const record = (recent: (0 | 1)[]): PlaceRecord => ({ seen: recent.length, correct: recent.filter(Boolean).length, recent, easySeen: 0, easyCorrect: 0 });

const storageWithPlaceRecords = (byModeVariant: Record<string, Record<string, PlaceRecord>>) => {
  const storage = memoryStorage();
  storage.setItem('ti:places', JSON.stringify(byModeVariant));
  return storage;
};

const storageWithAnswers = (byModeVariant: Record<string, Record<string, (0 | 1)[]>>) => storageWithPlaceRecords(Object.fromEntries(Object.entries(byModeVariant)
  .map(([modeVariant, byPlaceId]) => [modeVariant, Object.fromEntries(Object.entries(byPlaceId).map(([placeId, recent]) => [placeId, record(recent)]))])));

const storageWithRecords = (byPlaceId: Record<string, (0 | 1)[]>) => storageWithAnswers({ 'find:name': byPlaceId });

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

describe('the shuffled window', () => {
  it.each([false, true])('opens with different places for different random sources, Easy mode %s', (easy) => {
    const setup: RoundSetup = { ...learnEurope, region: 'world', easy };
    const openingWith = (seed: number) => playAllRight(startLearningWith(seededRandom(seed), setup), 5);

    expect(openingWith(1)).not.toEqual(openingWith(2));
  });

  it('draws each new place from the next 15 not-yet-learned places in ease order', () => {
    const easeOrder = playAllRight(startLearning(learnEurope), 46);

    const asked = playAllRight(startLearningWith(seededRandom(1), learnEurope), 46);

    asked.forEach((placeId, index) => {
      const nextFifteen = easeOrder.filter(id => !asked.slice(0, index).includes(id)).slice(0, 15);
      expect(nextFifteen).toContain(placeId);
    });
    expect(asked).not.toEqual(easeOrder);
  });
});

describe('the working set', () => {
  it('fills with weak places and shaky ones with a miss first, then unplayed ones, in ease order, and skips solid places', () => {
    const storage = storageWithRecords({ NZL: [0, 0, 0], FJI: [1, 1, 0], AUS: [1, 1, 1] });

    const asked = playAllRight(startLearning(learnOceania, storage, fiveOceaniaPlaces), 4);

    expect(asked).toEqual(['NZL', 'FJI', 'PNG', 'WSM']);
  });

  it('lines up places only ever answered right, but too few times to be solid, behind new places', () => {
    const storage = storageWithRecords({ AUS: [1], NZL: [1, 1], FJI: [1, 0], PNG: [0, 0, 1] });

    const asked = playAllRight(startLearning(learnOceania, storage, fiveOceaniaPlaces), 5);

    expect(asked).toEqual(['PNG', 'FJI', 'WSM', 'AUS', 'NZL']);
  });

  it('lets a new place join only when no miss is waiting and fewer than 4 misses are in play', () => {
    const asked = play(startLearning(learnEurope), '✗✗✗✓✓✓✗✓✓✓');

    expect(asked).toEqual(['RUS', 'DEU', 'FRA', 'RUS', 'DEU', 'FRA', 'GBR', 'RUS', 'ITA', 'GBR']);
  });
});

describe('a returning player', () => {
  it('meets the places missed last round first, then the new places, then the ones answered right', () => {
    const storage = memoryStorage();
    const firstRound = startLearningWith(seededRandom(1), learnOceania, storage);
    const [missed, ...answeredRight] = new Set(play(firstRound, '✗✓✓✓✓'));
    firstRound.send({ type: 'askEnd' });
    const easeOrder = playAllRight(startLearning(learnOceania), 14);

    const asked = playAllRight(startLearningWith(seededRandom(2), learnOceania, storage), 14);

    expect(asked[0]).toBe(missed);
    expect(asked.slice(1, 11).sort()).toEqual(easeOrder.filter(id => id !== missed && !answeredRight.includes(id)).sort());
    expect(asked.slice(11)).toEqual(easeOrder.filter(id => answeredRight.includes(id)));
  });
});

describe('the reach', () => {
  const learnWorld: RoundSetup = { ...learnEurope, region: 'world' };
  const easeOrder = playAllRight(startLearning(learnWorld), 80);
  const allRight = (placeIds: string[]) => Object.fromEntries(placeIds.map(placeId => [placeId, [1 as const]]));

  it('starts the new places just past it, at least 80% right on the first 60 places across modes testing the same knowledge, missed places first', () => {
    const answers: Record<string, Record<string, (0 | 1)[]>> = { 'find:name': {}, 'name:map': {}, 'find:both': {} };
    easeOrder.slice(0, 60).forEach((placeId, index) => {
      if (index % 10 === 4) answers['find:name']![placeId] = [0];
      else if (index % 10 !== 7) answers[['find:name', 'name:map', 'find:both'][index % 3]!]![placeId] = [1];
    });
    const missed = easeOrder.slice(0, 60).filter((_, index) => index % 10 === 4);

    const asked = playAllRight(startLearning(learnWorld, storageWithAnswers(answers)), 8);

    expect(asked).toEqual([...missed, easeOrder[60], easeOrder[61]]);
  });

  it('pools flag knowledge apart from name knowledge: by flag in Find on the map and Name that country, by name in Find on the map and Name on the map', () => {
    const learnByFlag: RoundSetup = { ...learnWorld, mode: 'country', variant: 'flag', easy: true };
    const flagEaseOrder = playAllRight(startLearning(learnByFlag), 31);
    const flagKnowledge = () => storageWithAnswers({ 'find:flag': allRight(flagEaseOrder.slice(0, 15)), 'country:flag': allRight(flagEaseOrder.slice(15, 30)) });
    const nameKnowledge = () => storageWithAnswers({ 'find:name': allRight(easeOrder.slice(0, 15)), 'name:map': allRight(easeOrder.slice(15, 30)) });

    expect(playAllRight(startLearning(learnWorld, flagKnowledge()), 1)).toEqual([easeOrder[0]]);
    expect(playAllRight(startLearning(learnByFlag, nameKnowledge()), 1)).toEqual([flagEaseOrder[0]]);
    expect(playAllRight(startLearning({ ...learnWorld, variant: 'flag' }, flagKnowledge()), 1)).toEqual([flagEaseOrder[30]]);
    expect(playAllRight(startLearning({ ...learnWorld, mode: 'name', variant: 'map', easy: true }, nameKnowledge()), 1)).toEqual([easeOrder[30]]);
  });

  it('moves with Easy-mode answers', () => {
    const storage = memoryStorage();
    const easyRound = startLearning({ ...learnWorld, easy: true }, storage);
    playAllRight(easyRound, 20);
    easyRound.send({ type: 'askEnd' });

    expect(playAllRight(startLearning(learnWorld, storage), 2)).toEqual([easeOrder[20], easeOrder[21]]);
  });

  it('moves with daily challenge answers', () => {
    const tenSovereignOceaniaPlaces = allPlaces.filter(({ id, region }) => region === 'Oceania' && !['MHL', 'PLW', 'NRU', 'TUV'].includes(id));
    const learnOceaniaByFlag: RoundSetup = { ...learnOceania, mode: 'country', variant: 'flag', tier: 'dependencies' };
    const storage = memoryStorage();
    const daily = boot(storage, tenSovereignOceaniaPlaces);
    daily.send({ type: 'startDaily', variant: 'flag' });
    playAllRight(daily, 10);

    expect(resultsOf(daily)).toMatchObject({ dailyDate: '2026-11-18', score: 10 });
    expect(promptOf(startLearning(learnOceaniaByFlag, memoryStorage(), tenSovereignOceaniaPlaces)).placeId).toBe('AUS');
    expect(promptOf(startLearning(learnOceaniaByFlag, storage, tenSovereignOceaniaPlaces)).placeId).toBe('NCL');
  });

  it('skips the places before it never answered in the round\'s mode and variant until the pool is exhausted, then asks them before the solid ones', () => {
    const oceaniaEaseOrder = playAllRight(startLearning(learnOceania), 14);
    const [first, second, third, fourth, neverAnswered, sixth] = oceaniaEaseOrder;
    const storage = storageWithAnswers({ 'name:map': { [first!]: [1], [second!]: [1], [third!]: [1], [fourth!]: [1], [sixth!]: [1] }, 'find:name': { [oceaniaEaseOrder[13]!]: [1, 1, 1] } });
    const game = startLearning(learnOceania, storage);

    const learned = playAllRight(game, 7);
    const firstAfterExhausted = promptOf(game);
    const reviewed = playAllRight(game, 7);

    expect(learned).toEqual(oceaniaEaseOrder.slice(6, 13));
    expect(firstAfterExhausted).toMatchObject({ placeId: first, learning: { isEverythingLearned: true } });
    expect(reviewed).toEqual([first, second, third, fourth, neverAnswered, sixth, oceaniaEaseOrder[13]]);
  });

  it('counts places never answered against it, so scattered answers deeper in the ease order carry it only a little further', () => {
    const answeredRight = easeOrder.filter((_, index) => index < 30 || index % 3 === 0);
    const storage = storageWithAnswers({ 'name:map': Object.fromEntries(answeredRight.map(placeId => [placeId, [1]])) });

    expect(playAllRight(startLearning(learnWorld, storage), 3)).toEqual(easeOrder.slice(43, 46));
  });

  it('does not skip a place before it that was missed in a mode testing the same knowledge', () => {
    const storage = storageWithAnswers({ 'name:map': Object.fromEntries(easeOrder.slice(0, 30).map((placeId, index) => [placeId, [index === 9 ? 0 : 1]])) });

    expect(playAllRight(startLearning(learnWorld, storage), 2)).toEqual([easeOrder[9], easeOrder[30]]);
  });

  it('starts at rank 1, still shuffled, when only answers testing other knowledge are stored', () => {
    const otherKnowledge = () => storageWithAnswers({ 'capital:map': allRight(easeOrder.slice(0, 40)), 'country:silhouette': allRight(easeOrder.slice(0, 40)), 'find:flag': allRight(easeOrder.slice(0, 40)) });
    const openingWith = (seed: number) => playAllRight(startLearningWith(seededRandom(seed), learnWorld, otherKnowledge()), 5);

    expect(openingWith(1)).not.toEqual(openingWith(2));
    expect(easeOrder.slice(0, 19)).toEqual(expect.arrayContaining([...openingWith(1), ...openingWith(2)]));
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
    const uninterrupted = startLearningWith(seededRandom(3), learnEurope);
    const storage = memoryStorage();
    const interrupted = startLearningWith(seededRandom(3), learnEurope, storage);
    play(uninterrupted, script);
    play(interrupted, script);

    const resumed = boot(storage, allPlaces, seededRandom(4));

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
