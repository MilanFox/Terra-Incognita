import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { curatedDir, fromRepoRoot, shippedDir, sourcesDir } from '../paths.ts';
import type { Tier } from '../model.ts';

export type IdChanges = { idMoves: Record<string, Record<string, string>>, removed: Record<string, string[]> };
export type Version = {
  dataVersion: number
  ne: string
  builtAt: string
  counts: Record<Tier, number>
  sources: { cldr: string, wikidataDate: string, flagsDate: string }
  idMoves: IdChanges['idMoves']
  removed: IdChanges['removed']
};

const versionName = 'version.json';

export const readIdChanges = (): IdChanges => JSON.parse(readFileSync(resolve(curatedDir, 'id-changes.json'), 'utf8'));

export const readShippedFiles = () => {
  const files = new Map<string, string>();
  if (!existsSync(shippedDir)) return files;
  for (const name of readdirSync(shippedDir, { recursive: true, encoding: 'utf8' })) {
    const path = resolve(shippedDir, name);
    if (name !== versionName && statSync(path).isFile()) files.set(name, readFileSync(path, 'utf8'));
  }
  return files;
};

// What the build is about to overwrite: the shipped files on disk.
export const readPreviousOutput = () => {
  const versionPath = resolve(shippedDir, versionName);
  const files = readShippedFiles();
  const placesText = files.get('places.json');
  return {
    files,
    version: existsSync(versionPath) ? JSON.parse(readFileSync(versionPath, 'utf8')) as Partial<Version> : undefined,
    placeIds: placesText ? (JSON.parse(placesText) as { id: string }[]).map(({ id }) => id) : [],
  };
};
export type PreviousOutput = ReturnType<typeof readPreviousOutput>;

export const readSourceStamps = (): Version['sources'] => {
  const fetched = JSON.parse(readFileSync(resolve(sourcesDir, 'fetched.json'), 'utf8'));
  return { cldr: fetched.cldr.version, wikidataDate: fetched.wikidata.fetchedOn, flagsDate: fetched.flags.fetchedOn };
};

const contentOf = ({ ne, counts, sources, idMoves, removed }: Partial<Version>) => JSON.stringify({ ne, counts, sources, idMoves, removed });

const sameFiles = (before: Map<string, string>, after: Map<string, string>) =>
  before.size === after.size && [...after].every(([name, text]) => before.get(name) === text);

// Call after every other shipped file is written. The version moves only when the output differs from the previous one.
export const writeVersion = (previous: PreviousOutput, content: Omit<Version, 'dataVersion' | 'builtAt'>) => {
  const previousVersion = previous.version?.dataVersion ?? 0;
  const unchanged = previous.version?.dataVersion !== undefined
    && sameFiles(previous.files, readShippedFiles())
    && contentOf(previous.version) === contentOf(content);
  const dataVersion = unchanged ? previousVersion : previousVersion + 1;
  const builtAt = unchanged ? previous.version!.builtAt! : new Date().toISOString().slice(0, 10);
  const { ne, counts, sources, idMoves, removed } = content;
  const version: Version = { dataVersion, ne, builtAt, counts, sources, idMoves, removed };
  const path = resolve(shippedDir, versionName);
  writeFileSync(path, `${JSON.stringify(version, null, 2)}\n`);
  console.log(`  ${fromRepoRoot(path)}: data version ${dataVersion}${unchanged ? ' (unchanged)' : ` (was ${previousVersion || 'none'})`}`);
};
