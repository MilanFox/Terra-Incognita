import type { Answer, DataVersion, KeyValueStorage } from './game';
import type { PlaceRecord, PlaceRecords } from './records';

// eslint-disable-next-line no-unused-vars
export type SchemaMigration = (storage: KeyValueStorage) => void;
export type IdMoves = Record<string, string>;

interface StoredMeta {
  schema: number
  dataVersion: number
}

const metaStorageKey = 'ti:meta';
const placesStorageKey = 'ti:places';
const roundStorageKey = 'ti:round';
const setupStorageKey = 'ti:setup';

const readJson = (storage: KeyValueStorage, key: string): unknown => {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null');
  }
  catch {
    return null;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const makeStoredSetupsUntimed: SchemaMigration = (storage) => {
  const untimed = (setup: unknown) => (isObject(setup) ? { timed: false, ...setup } : setup);
  const stored = readJson(storage, setupStorageKey);
  if (isObject(stored) && isObject(stored.setups)) {
    const setups = Object.fromEntries(Object.entries(stored.setups).map(([mode, setup]) => [mode, untimed(setup)]));
    storage.setItem(setupStorageKey, JSON.stringify({ ...stored, setups }));
  }
  const round = readJson(storage, roundStorageKey);
  if (isObject(round)) storage.setItem(roundStorageKey, JSON.stringify({ ...round, setup: untimed(round.setup) }));
};

const moveStoredRoundToPausableClock: SchemaMigration = (storage) => {
  const round = readJson(storage, roundStorageKey);
  if (!isObject(round)) return;
  const { backgroundMs, ...unchangedFields } = round;
  storage.setItem(roundStorageKey, JSON.stringify({ ...unchangedFields, stoppedMs: backgroundMs, pausedAt: null, pausesUsed: 0 }));
};

// Entry n upgrades schema n + 1 to n + 2.
export const schemaMigrations: SchemaMigration[] = [makeStoredSetupsUntimed, moveStoredRoundToPausableClock];

const readMeta = (storage: KeyValueStorage): StoredMeta | undefined => {
  const stored = readJson(storage, metaStorageKey) as Partial<StoredMeta> | null;
  return typeof stored?.schema === 'number' && typeof stored.dataVersion === 'number' ? stored as StoredMeta : undefined;
};

export const idMovesSince = ({ idMoves }: Pick<DataVersion, 'idMoves'>, storedDataVersion: number): IdMoves[] => Object.keys(idMoves)
  .map(Number)
  .filter(movedAt => movedAt > storedDataVersion)
  .sort((first, second) => first - second)
  .map(movedAt => idMoves[String(movedAt)]!);

export const remapId = (placeId: string, moveSteps: IdMoves[]) => moveSteps.reduce((current, moves) => moves[current] ?? current, placeId);

const mergeRecords = (kept: PlaceRecord, moved: PlaceRecord): PlaceRecord => {
  const merged: PlaceRecord = {
    seen: kept.seen + moved.seen,
    correct: kept.correct + moved.correct,
    recent: moved.recent.length > kept.recent.length ? moved.recent : kept.recent,
    easySeen: kept.easySeen + moved.easySeen,
    easyCorrect: kept.easyCorrect + moved.easyCorrect,
  };
  const confusedWith = kept.confusedWith ?? moved.confusedWith;
  if (confusedWith) merged.confusedWith = confusedWith;
  return merged;
};

export const remapPlaceRecords = (records: PlaceRecords, moveSteps: IdMoves[]): PlaceRecords => Object.fromEntries(
  Object.entries(records).map(([modeVariant, byPlaceId]) => {
    const remapped: Record<string, PlaceRecord> = {};
    for (const [placeId, record] of Object.entries(byPlaceId)) {
      const newId = remapId(placeId, moveSteps);
      const existing = remapped[newId];
      const confusedWith = record.confusedWith === undefined ? undefined : remapId(record.confusedWith, moveSteps);
      const moved: PlaceRecord = { ...record };
      delete moved.confusedWith;
      if (confusedWith !== undefined && confusedWith !== newId) moved.confusedWith = confusedWith;
      remapped[newId] = existing ? mergeRecords(existing, moved) : moved;
    }
    return [modeVariant, remapped];
  }),
);

const applyIdMoves = (storage: KeyValueStorage, moveSteps: IdMoves[]) => {
  const round = readJson(storage, roundStorageKey) as { deck?: string[], answers?: Answer[], wrongTapPlaceIds?: string[] } | null;
  if (moveSteps.length > 0 && Array.isArray(round?.deck) && Array.isArray(round.answers)) {
    const remap = (placeId: string) => remapId(placeId, moveSteps);
    storage.setItem(roundStorageKey, JSON.stringify({
      ...round,
      deck: round.deck.map(remap),
      answers: round.answers.map(answer => ({ ...answer, placeId: remap(answer.placeId), tappedPlaceId: remap(answer.tappedPlaceId) })),
      wrongTapPlaceIds: Array.isArray(round.wrongTapPlaceIds) ? round.wrongTapPlaceIds.map(remap) : [],
    }));
  }
  const records = readJson(storage, placesStorageKey);
  if (moveSteps.length === 0 || typeof records !== 'object' || records === null) return;
  storage.setItem(placesStorageKey, JSON.stringify(remapPlaceRecords(records as PlaceRecords, moveSteps)));
};

export const migrateStorage = (storage: KeyValueStorage, version: DataVersion, migrations: SchemaMigration[] = schemaMigrations) => {
  const schema = migrations.length + 1;
  const meta = readMeta(storage);
  if (meta) {
    migrations.slice(meta.schema - 1).forEach(migrate => migrate(storage));
    applyIdMoves(storage, idMovesSince(version, meta.dataVersion));
  }
  storage.setItem(metaStorageKey, JSON.stringify({ schema: Math.max(schema, meta?.schema ?? 0), dataVersion: Math.max(version.dataVersion, meta?.dataVersion ?? 0) }));
};
