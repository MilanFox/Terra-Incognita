import { describe, expect, it } from 'vitest';
import shippedNames from '../../public/data/names.json';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame, isNoMapMode, isTypedMode } from './game';
import type { KeyValueStorage, Mode, Place, RegionChoice, RoundSetup, Tier } from './game';
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

const createCountryGame = (storage = memoryStorage()) => createGame({ places, names, version: shippedVersion, random: seededRandom(1), clock: () => Date.UTC(2026, 10, 18), storage });

const countrySetup = (changes: Partial<RoundSetup> = {}): RoundSetup => ({ ...createCountryGame().setupFor('country'), ...changes });

const tiers: Tier[] = ['sovereign', 'defacto', 'dependencies'];
const regions: RegionChoice[] = ['world', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
const flaglessIds = places.filter(({ flag }) => flag === null).map(({ id }) => id);

describe('Name that country setup', () => {
  it('is the flag variant, whole world, sovereign tier, 10 prompts, untimed and Easy mode off', () => {
    expect(countrySetup()).toEqual({ mode: 'country', variant: 'flag', region: 'world', tier: 'sovereign', deckSize: 10, easy: false, timed: false });
  });

  it('offers only the flag variant, and a silhouette round does not start', () => {
    const game = createCountryGame();

    expect(game.choicesFor(countrySetup()).variants.map(({ value }) => value)).toEqual(['flag']);

    game.send({ type: 'start', setup: countrySetup({ variant: 'silhouette' }) });

    expect(game.state).toEqual({ phase: 'home' });
  });

  it('is a typed mode without a map to answer on', () => {
    expect(isTypedMode('country')).toBe(true);
    expect(isNoMapMode('country')).toBe(true);
    expect((['find', 'name'] as Mode[]).some(isNoMapMode)).toBe(false);
  });
});

describe('Name that country by flag', () => {
  it('leaves every flagless place out of every pool, in every tier and region', () => {
    const game = createCountryGame();

    expect(flaglessIds).toEqual(['BLM', 'HMD', 'MAF', 'SPM', 'UMI', 'WLF']);
    for (const tier of tiers) {
      for (const region of regions) {
        expect(game.poolOf(countrySetup({ tier, region })).filter(id => flaglessIds.includes(id))).toEqual([]);
      }
    }
    expect(game.poolOf(countrySetup({ tier: 'dependencies' }))).toHaveLength(places.length - flaglessIds.length);
    expect(game.poolOf(countrySetup())).toHaveLength(197);
  });

  it('never asks a flagless place in a round of all dependencies', () => {
    const game = createCountryGame();
    game.send({ type: 'start', setup: countrySetup({ tier: 'dependencies', deckSize: 'all' }) });
    const askedPlaceIds: string[] = [];
    while (game.state.phase === 'prompt') {
      askedPlaceIds.push(game.state.placeId);
      game.send({ type: 'dontKnow' });
      game.send({ type: 'next' });
    }

    expect(askedPlaceIds).toHaveLength(places.length - flaglessIds.length);
    expect(askedPlaceIds.filter(id => flaglessIds.includes(id))).toEqual([]);
  });

  it('takes the place\'s typed name as right and records it under the mode and variant', () => {
    const storage = memoryStorage();
    const game = createCountryGame(storage);
    game.send({ type: 'start', setup: countrySetup() });
    if (game.state.phase !== 'prompt') throw new Error('Expected a prompt');
    const { placeId } = game.state;

    game.send({ type: 'tap', placeId });

    expect(game.state).toMatchObject({ phase: 'prompt', placeId });

    game.send({ type: 'submit', text: (names[placeId] as PlaceNames).de.name });

    expect(game.state).toMatchObject({ phase: 'verdict', score: 1, answer: { placeId, outcome: 'right' } });
    expect(Object.keys(JSON.parse(storage.getItem('ti:places')!))).toEqual(['country:flag']);
  });

  it('lasts 15 s per prompt when timed', () => {
    const game = createCountryGame();
    game.send({ type: 'start', setup: countrySetup({ timed: true }) });

    expect(game.timeLeftMs()).toBe(150_000);
  });
});

describe('the silhouette variant, not offered yet', () => {
  it('would leave out every place with an unreadable silhouette', () => {
    const unreadableIds = places.filter(({ silhouette }) => silhouette === false).map(({ id }) => id);
    const pool = createCountryGame().poolOf(countrySetup({ variant: 'silhouette', tier: 'dependencies' }));

    expect(unreadableIds.length).toBeGreaterThan(0);
    expect(pool).toHaveLength(places.length - unreadableIds.length);
    expect(pool.filter(id => unreadableIds.includes(id))).toEqual([]);
  });
});
