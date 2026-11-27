import { describe, expect, it } from 'vitest';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame } from './game';
import type { KeyValueStorage, Place } from './game';
import { createYourData } from './your-data';
import type { SchemaMigration } from './migrations';

const places = shippedPlaces as Place[];
const clock = () => Date.UTC(2026, 10, 17, 12);

const memoryStorage = (): KeyValueStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
};

const playAllRight = (game: ReturnType<typeof createGame>) => {
  while (game.state.phase === 'prompt') {
    game.send({ type: 'tap', placeId: game.state.placeId });
    game.send({ type: 'next' });
  }
};

const playedStorage = () => {
  const storage = memoryStorage();
  const game = createGame({ places, version: shippedVersion, random: () => 0.5, clock, storage });
  game.send({ type: 'start', setup: game.setupFor('find') });
  playAllRight(game);
  game.send({ type: 'leave' });
  game.send({ type: 'startDaily', variant: game.dailyVariant() });
  playAllRight(game);
  storage.setItem('ti:settings', JSON.stringify({ sound: false, language: 'de' }));
  storage.setItem('ti:setup', JSON.stringify({ lastMode: 'find', setups: { find: game.setupFor('find') } }));
  return storage;
};

const yourDataOf = (storage: KeyValueStorage, schemaMigrations?: SchemaMigration[]) => createYourData({ storage, version: shippedVersion, clock, schemaMigrations });

describe('export', () => {
  it('names the file by Berlin date and holds every data key but the round in progress', () => {
    const storage = playedStorage();
    const { fileName, json } = yourDataOf(storage).exportData();
    const contents = JSON.parse(json);
    expect(fileName).toBe('terra-incognita-2026-11-17.json');
    expect(Object.keys(contents.data).sort()).toEqual(['bests', 'daily', 'places', 'rounds', 'settings', 'setup']);
    expect(contents.data.places).toEqual(JSON.parse(storage.getItem('ti:places')!));
    expect(contents.data.rounds).toHaveLength(2);
    expect(contents.schema).toBe(JSON.parse(storage.getItem('ti:meta')!).schema);
  });

  it('exports an empty player as a file that imports cleanly', () => {
    const { json } = yourDataOf(memoryStorage()).exportData();
    expect(JSON.parse(json).data).toEqual({});
    expect(yourDataOf(memoryStorage()).importData(json)).toEqual({ ok: true });
  });
});

describe('import', () => {
  it('replaces the current data with the file and drops what the file lacks', () => {
    const played = playedStorage();
    const playedPlaces = JSON.parse(played.getItem('ti:places')!);
    played.setItem('ti:places', JSON.stringify({ ...playedPlaces, 'name:map': { NER: { seen: 2, correct: 0, recent: [0, 0], easySeen: 0, easyCorrect: 0, confusedWith: 'NGA', confusions: { NGA: 2 } } } }));
    const { json } = yourDataOf(played).exportData();
    const target = memoryStorage();
    target.setItem('ti:bests', JSON.stringify({ stale: { score: 1, fastestPerfectMs: null } }));
    target.setItem('ti:round', '{}');
    expect(yourDataOf(target).importData(json)).toEqual({ ok: true });
    expect(target.getItem('ti:places')).toBe(JSON.stringify(JSON.parse(json).data.places));
    expect(JSON.parse(target.getItem('ti:places')!)['name:map'].NER.confusions).toEqual({ NGA: 2 });
    expect(target.getItem('ti:settings')).toBe(JSON.stringify({ sound: false, language: 'de' }));
    expect(target.getItem('ti:bests')).toBe(JSON.stringify(JSON.parse(json).data.bests));
    expect(target.getItem('ti:round')).toBeNull();
  });

  it('runs the schema migrations the file missed and the id moves of newer data versions', () => {
    const order: string[] = [];
    const schemaMigrations = [() => order.push('1 to 2'), () => order.push('2 to 3')];
    const file = JSON.stringify({ app: 'terra-incognita', schema: 2, dataVersion: 1, data: { places: { 'find:flag': { AAA: { seen: 1, correct: 1, recent: [1], easySeen: 0, easyCorrect: 0 } } } } });
    const target = memoryStorage();
    const version = { dataVersion: 2, idMoves: { 2: { AAA: 'BBB' } } };
    expect(createYourData({ storage: target, version, clock, schemaMigrations }).importData(file)).toEqual({ ok: true });
    expect(order).toEqual(['2 to 3']);
    expect(Object.keys(JSON.parse(target.getItem('ti:places')!)['find:flag'])).toEqual(['BBB']);
    expect(JSON.parse(target.getItem('ti:meta')!)).toEqual({ schema: 3, dataVersion: 2 });
  });

  it('migrates a real export from an older schema without crashing the game', () => {
    const { json } = yourDataOf(playedStorage()).exportData();
    const older = JSON.stringify({ ...JSON.parse(json), schema: 1 });
    const target = memoryStorage();
    expect(yourDataOf(target).importData(older)).toEqual({ ok: true });
    expect(JSON.parse(target.getItem('ti:setup')!).setups.find.timed).toBe(false);
    expect(() => createGame({ places, version: shippedVersion, random: () => 0.5, clock, storage: target })).not.toThrow();
  });

  it.each([
    ['text that is not JSON', 'nope'],
    ['JSON of another app', JSON.stringify({ schema: 1, dataVersion: 1, data: {} })],
    ['a data key of the wrong shape', JSON.stringify({ app: 'terra-incognita', schema: 1, dataVersion: 1, data: { rounds: {} } })],
    ['an unknown data key', JSON.stringify({ app: 'terra-incognita', schema: 1, dataVersion: 1, data: { other: {} } })],
    ['no schema', JSON.stringify({ app: 'terra-incognita', dataVersion: 1, data: {} })],
  ])('refuses %s and changes nothing', (_description, text) => {
    const target = playedStorage();
    const before = target.getItem('ti:places');
    expect(yourDataOf(target).importData(text)).toEqual({ ok: false, reason: 'invalid' });
    expect(target.getItem('ti:places')).toBe(before);
  });

  it('refuses a file from a newer schema', () => {
    const target = memoryStorage();
    const file = JSON.stringify({ app: 'terra-incognita', schema: 99, dataVersion: 1, data: {} });
    expect(yourDataOf(target).importData(file)).toEqual({ ok: false, reason: 'newer' });
    expect(target.getItem('ti:meta')).toBeNull();
  });
});

describe('reset stats', () => {
  it('clears places, rounds, bests and daily records, and leaves settings, setups and meta', () => {
    const storage = playedStorage();
    const kept = ['ti:settings', 'ti:setup', 'ti:meta'].map(key => storage.getItem(key));
    expect(['ti:places', 'ti:rounds', 'ti:daily'].map(key => storage.getItem(key))).not.toContain(null);
    yourDataOf(storage).resetStats();
    expect(['ti:places', 'ti:rounds', 'ti:bests', 'ti:daily'].map(key => storage.getItem(key))).toEqual([null, null, null, null]);
    expect(['ti:settings', 'ti:setup', 'ti:meta'].map(key => storage.getItem(key))).toEqual(kept);
  });

  it('empties the streak', () => {
    const storage = playedStorage();
    const gameBefore = createGame({ places, version: shippedVersion, random: () => 0.5, clock, storage });
    expect(gameBefore.streak().current).toBe(1);
    yourDataOf(storage).resetStats();
    const game = createGame({ places, version: shippedVersion, random: () => 0.5, clock, storage });
    expect(game.streak()).toEqual({ current: 0, longest: 0 });
  });
});
