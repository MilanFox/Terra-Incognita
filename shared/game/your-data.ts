import { berlinDateOf } from './daily';
import type { DataVersion, KeyValueStorage } from './game';
import { migrateStorage, schemaMigrations } from './migrations';
import type { SchemaMigration } from './migrations';

export type ImportFailure = 'invalid' | 'newer';

export interface YourDataDependencies {
  storage: KeyValueStorage
  version: DataVersion
  clock: () => number
  schemaMigrations?: SchemaMigration[]
}

const metaStorageKey = 'ti:meta';
const roundStorageKey = 'ti:round';
const exportMarker = 'terra-incognita';

const exportedKeys = {
  places: { key: 'ti:places', isArray: false },
  rounds: { key: 'ti:rounds', isArray: true },
  bests: { key: 'ti:bests', isArray: false },
  daily: { key: 'ti:daily', isArray: false },
  settings: { key: 'ti:settings', isArray: false },
  setup: { key: 'ti:setup', isArray: false },
};

const statsKeys = ['ti:places', 'ti:rounds', 'ti:bests', 'ti:daily'];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJson = (text: string | null): unknown => {
  try {
    return JSON.parse(text ?? 'null');
  }
  catch {
    return null;
  }
};

export const createYourData = ({ storage, version, clock, schemaMigrations: migrations = schemaMigrations }: YourDataDependencies) => {
  const currentSchema = migrations.length + 1;

  const exportData = () => {
    const meta = parseJson(storage.getItem(metaStorageKey));
    const data = Object.fromEntries(Object.entries(exportedKeys).flatMap(([name, { key }]) => {
      const stored = parseJson(storage.getItem(key));
      return stored === null ? [] : [[name, stored]];
    }));
    const contents = {
      app: exportMarker,
      exportedAt: new Date(clock()).toISOString(),
      schema: isObject(meta) && typeof meta.schema === 'number' ? meta.schema : currentSchema,
      dataVersion: isObject(meta) && typeof meta.dataVersion === 'number' ? meta.dataVersion : version.dataVersion,
      data,
    };
    return { fileName: `terra-incognita-${berlinDateOf(clock())}.json`, json: JSON.stringify(contents, null, 2) };
  };

  const importData = (text: string): { ok: true } | { ok: false, reason: ImportFailure } => {
    const contents = parseJson(text);
    if (!isObject(contents) || contents.app !== exportMarker || !isObject(contents.data)) return { ok: false, reason: 'invalid' };
    const { schema, dataVersion, data } = contents;
    if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1 || typeof dataVersion !== 'number') return { ok: false, reason: 'invalid' };
    if (schema > currentSchema) return { ok: false, reason: 'newer' };
    const entries = Object.entries(exportedKeys).filter(([name]) => name in data);
    const isShapeValid = entries.every(([name, { isArray }]) => (isArray ? Array.isArray(data[name]) : isObject(data[name])));
    if (!isShapeValid || Object.keys(data).some(name => !(name in exportedKeys))) return { ok: false, reason: 'invalid' };

    Object.entries(exportedKeys).forEach(([name, { key }]) => {
      if (name in data) storage.setItem(key, JSON.stringify(data[name]));
      else storage.removeItem(key);
    });
    storage.removeItem(roundStorageKey);
    storage.setItem(metaStorageKey, JSON.stringify({ schema, dataVersion }));
    migrateStorage(storage, version, migrations);
    return { ok: true };
  };

  const resetStats = () => statsKeys.forEach(key => storage.removeItem(key));

  return { exportData, importData, resetStats };
};

export type YourData = ReturnType<typeof createYourData>;
