import type { Answer, DailyVariant, KeyValueStorage, Mode, RegionChoice, RoundSetup, Tier, Variant } from './game';

export interface PlaceRecord {
  seen: number
  correct: number
  recent: (0 | 1)[]
  easySeen: number
  easyCorrect: number
  confusedWith?: string
  confusions?: Record<string, number>
}

export type PlaceRecords = Record<string, Record<string, PlaceRecord>>;

export interface RoundSummary {
  date: number
  mode: Mode
  variant: Variant
  region: RegionChoice
  tier: Tier
  deckSize: number
  timed: boolean
  easy: boolean
  daily: boolean
  learn: boolean
  score: number
  complete: boolean
  elapsedMs: number
  pausesUsed: number
  dataVersion: number
}

export interface PersonalBest {
  score: number
  fastestPerfectMs: number | null
}

export type PersonalBests = Record<string, PersonalBest>;

export interface DailyRecord {
  date: string
  variant: DailyVariant
  score: number
  deckSize: number
  elapsedMs: number
  complete: boolean
  cells?: DailyCell[]
}

export type DailyCell = 'right' | 'wrong' | 'missed';

export type DailyRecords = Record<string, DailyRecord>;

const placesStorageKey = 'ti:places';
const roundsStorageKey = 'ti:rounds';
const bestsStorageKey = 'ti:bests';
const dailyStorageKey = 'ti:daily';
const recentLength = 8;
const roundLogLength = 1000;

export const modeVariantOf = ({ mode, variant }: RoundSetup) => `${mode}:${variant}`;

export const bestKeyOf = ({ mode, variant, region, tier, deckSize, easy, timed }: RoundSetup) => (mode === 'wayfinder'
  ? [mode, easy ? 'easy' : 'normal']
  : [mode, variant, region, tier, deckSize, easy ? 'easy' : 'normal', ...(mode === 'missing' ? [timed ? 'timed' : 'untimed'] : [])]).join(':');

const noRecord = (): PlaceRecord => ({ seen: 0, correct: 0, recent: [], easySeen: 0, easyCorrect: 0 });

const withConfusion = (record: PlaceRecord, confusedWith: string): PlaceRecord => ({ ...record, confusedWith, confusions: { ...record.confusions, [confusedWith]: (record.confusions?.[confusedWith] ?? 0) + 1 } });

export const createRecords = (storage: KeyValueStorage) => {
  const read = <T extends object>(key: string, empty: T): T => {
    try {
      const stored: unknown = JSON.parse(storage.getItem(key) ?? 'null');
      if (typeof stored === 'object' && stored !== null && Array.isArray(stored) === Array.isArray(empty)) return stored as T;
    }
    catch {
      // A damaged entry is treated as empty.
    }
    return empty;
  };

  const roundLog = () => read<RoundSummary[]>(roundsStorageKey, []);

  const recordAnswer = (setup: RoundSetup, { placeId, outcome }: Answer, confusedWith: string | undefined) => {
    const records = read<PlaceRecords>(placesStorageKey, {});
    const modeVariant = modeVariantOf(setup);
    const record = { ...noRecord(), ...records[modeVariant]?.[placeId] };
    const right: 0 | 1 = outcome === 'right' ? 1 : 0;
    const answered: PlaceRecord = setup.easy
      ? { ...record, easySeen: record.easySeen + 1, easyCorrect: record.easyCorrect + right }
      : { ...record, seen: record.seen + 1, correct: record.correct + right, recent: [...record.recent, right].slice(-recentLength) };
    const updated = confusedWith ? withConfusion(answered, confusedWith) : answered;
    storage.setItem(placesStorageKey, JSON.stringify({ ...records, [modeVariant]: { ...records[modeVariant], [placeId]: updated } }));
  };

  const recordConfusion = (setup: RoundSetup, placeId: string, confusedWith: string | undefined) => {
    if (!confusedWith) return;
    const records = read<PlaceRecords>(placesStorageKey, {});
    const modeVariant = modeVariantOf(setup);
    const updated = withConfusion({ ...noRecord(), ...records[modeVariant]?.[placeId] }, confusedWith);
    storage.setItem(placesStorageKey, JSON.stringify({ ...records, [modeVariant]: { ...records[modeVariant], [placeId]: updated } }));
  };

  const placeRecordsOf = (setup: RoundSetup): Record<string, PlaceRecord> => read<PlaceRecords>(placesStorageKey, {})[modeVariantOf(setup)] ?? {};

  const logRound = (summary: RoundSummary) => {
    storage.setItem(roundsStorageKey, JSON.stringify([...roundLog(), summary].slice(-roundLogLength)));
  };

  const personalBests = () => read<PersonalBests>(bestsStorageKey, {});

  const recordBest = (setup: RoundSetup, { score, deckSize, elapsedMs }: RoundSummary) => {
    const bests = personalBests();
    const key = bestKeyOf(setup);
    const previous: PersonalBest = bests[key] ?? { score: 0, fastestPerfectMs: null };
    const isFasterPerfect = setup.mode !== 'wayfinder' && score === deckSize && (previous.fastestPerfectMs === null || elapsedMs < previous.fastestPerfectMs);
    const best: PersonalBest = { score: Math.max(score, previous.score), fastestPerfectMs: isFasterPerfect ? elapsedMs : previous.fastestPerfectMs };
    storage.setItem(bestsStorageKey, JSON.stringify({ ...bests, [key]: best }));
    return score > previous.score || (isFasterPerfect && previous.fastestPerfectMs !== null);
  };

  const dailyRecords = () => read<DailyRecords>(dailyStorageKey, {});

  const recordDaily = (record: DailyRecord) => {
    storage.setItem(dailyStorageKey, JSON.stringify({ ...dailyRecords(), [record.date]: record }));
  };

  return { roundLog, recordAnswer, recordConfusion, placeRecordsOf, logRound, personalBests, recordBest, dailyRecords, recordDaily };
};
