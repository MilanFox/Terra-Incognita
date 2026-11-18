import { describe, expect, it } from 'vitest';
import shippedNames from '../../public/data/names.json';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame, isTypedMode } from './game';
import type { Game, KeyValueStorage, Place, RoundSetup } from './game';
import type { NamesFile, PlaceNames } from './matcher';

const fiveOceaniaPlaceIds = ['AUS', 'NZL', 'FJI', 'PNG', 'WSM'];
const places = (shippedPlaces as Place[]).filter(({ id, region, tier }) => region !== 'Oceania' || tier !== 'sovereign' || fiveOceaniaPlaceIds.includes(id));
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

const newGame = () => createGame({ places, names, version: shippedVersion, random: seededRandom(3), clock: () => Date.UTC(2026, 10, 18, 9), storage: memoryStorage() });

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

const weakOceania: RoundSetup = { ...oceaniaRound, roundKind: 'weak' };
const allWrong = '✗✗✗';

const weakChoiceOf = (game: Game, setup: RoundSetup) => game.choicesFor(setup).roundKinds.find(({ value }) => value === 'weak')!;

describe('Weak ones pool', () => {
  it('holds only the places rated weak or shaky for the mode and variant, after region', () => {
    const game = newGame();
    playRounds(game, {}, { AUS: '✓✓✓', NZL: allWrong, FJI: '✓✓✗', PNG: '✓✓✓', WSM: '✓✓✓' });

    expect(game.poolOf(weakOceania).sort()).toEqual(['FJI', 'NZL']);
    expect(game.poolOf({ ...weakOceania, region: 'Europe' })).toEqual([]);
  });

  it('leaves places without data out', () => {
    const game = newGame();
    playRounds(game, {}, { AUS: allWrong });

    expect(game.poolOf({ ...weakOceania, region: 'world' })).toEqual(['AUS']);
    expect(game.poolOf({ ...weakOceania, mode: 'name' })).toEqual([]);
  });

  it('rates per mode and variant', () => {
    const game = newGame();
    playRounds(game, {}, { AUS: allWrong, NZL: allWrong, FJI: allWrong, PNG: allWrong, WSM: allWrong });

    expect(game.poolOf(weakOceania)).toHaveLength(5);
    expect(game.poolOf({ ...weakOceania, variant: 'name' })).toEqual([]);
  });

  it('is the whole pool for a normal Quiz round', () => {
    const game = newGame();
    playRounds(game, {}, { AUS: allWrong });

    expect(game.poolOf({ ...oceaniaRound, roundKind: 'quiz' })).toHaveLength(5);
    expect(game.poolOf(oceaniaRound)).toHaveLength(5);
  });

  it('is not applied to special modes', () => {
    const game = newGame();

    expect(game.poolOf({ ...weakOceania, mode: 'fill' })).toHaveLength(5);
  });

  it('shows the real count as Play count', () => {
    const game = newGame();
    playRounds(game, {}, { AUS: '✓✓✓', NZL: allWrong, FJI: allWrong, PNG: allWrong, WSM: allWrong });

    expect(game.choicesFor(weakOceania).playCount).toBe(4);
    expect(game.choicesFor({ ...weakOceania, region: 'world' }).playCount).toBe(4);
  });
});

describe('Weak ones under 5 places', () => {
  it('is shown with its count but unavailable', () => {
    const game = newGame();
    playRounds(game, {}, { AUS: '✓✓✓', NZL: allWrong, FJI: allWrong, PNG: allWrong, WSM: allWrong });

    expect(weakChoiceOf(game, oceaniaRound)).toEqual({ value: 'weak', count: 4, isAvailable: false });
  });

  it('is available from 5 places', () => {
    const game = newGame();
    playRounds(game, {}, { AUS: allWrong, NZL: allWrong, FJI: allWrong, PNG: allWrong, WSM: allWrong });

    expect(weakChoiceOf(game, oceaniaRound)).toEqual({ value: 'weak', count: 5, isAvailable: true });
  });

  it('cannot be started', () => {
    const game = newGame();
    playRounds(game, {}, { AUS: '✓✓✓', NZL: allWrong });

    game.send({ type: 'start', setup: weakOceania });

    expect(game.state.phase).toBe('home');
  });

  it('falls back to Quiz in the remembered setup', () => {
    const game = newGame();
    playRounds(game, {}, { AUS: allWrong, NZL: allWrong, FJI: allWrong, PNG: allWrong, WSM: allWrong });
    game.send({ type: 'start', setup: weakOceania });
    game.send({ type: 'leave' });
    expect(game.setupFor('find').roundKind).toBe('weak');

    playRounds(game, { roundKind: 'quiz' }, { AUS: '✓✓✓✓✓✓✓✓', NZL: '✓✓✓✓✓✓✓✓' });

    expect(game.setupFor('find').roundKind).toBe('quiz');
  });
});

describe('a Weak ones round', () => {
  it('plays the narrowed pool and is recorded like a normal round', () => {
    const game = newGame();
    playRounds(game, {}, { AUS: allWrong, NZL: allWrong, FJI: allWrong, PNG: allWrong, WSM: allWrong });

    game.send({ type: 'start', setup: weakOceania });
    const askedPlaceIds: string[] = [];
    while (game.state.phase === 'prompt') {
      askedPlaceIds.push(game.state.placeId);
      answerPrompt(game, game.state.placeId, true);
      game.send({ type: 'next' });
    }

    expect(askedPlaceIds.sort()).toEqual(fiveOceaniaPlaceIds.slice().sort());
    expect(game.state.phase).toBe('results');
  });
});
