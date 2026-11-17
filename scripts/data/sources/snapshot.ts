import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fromRepoRoot, sourcesDir } from '../paths.ts';

const fetchedFile = resolve(sourcesDir, 'fetched.json');

type Fetched = Record<string, { fetchedOn: string, [detail: string]: string }>;

const readText = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined);

// A source's date moves only when one of its snapshots changed, so a fetch that finds nothing new changes nothing.
export const writeSnapshots = (source: string, snapshots: Record<string, string>, details: Record<string, string>) => {
  mkdirSync(sourcesDir, { recursive: true });
  const fetched: Fetched = JSON.parse(readText(fetchedFile) ?? '{}');
  const changed = Object.entries(snapshots).filter(([name, text]) => readText(resolve(sourcesDir, name)) !== text);
  const detailsChanged = Object.entries(details).some(([key, value]) => fetched[source]?.[key] !== value);
  for (const [name, text] of changed) {
    writeFileSync(resolve(sourcesDir, name), text);
    console.log(`  written     ${fromRepoRoot(resolve(sourcesDir, name))} (${Math.round(text.length / 1024)} KB)`);
  }
  if (!changed.length) console.log('  unchanged');
  if (changed.length || detailsChanged || !fetched[source]) {
    const fetchedOn = changed.length || !fetched[source] ? new Date().toISOString().slice(0, 10) : fetched[source].fetchedOn;
    fetched[source] = { fetchedOn, ...details };
    const sorted = Object.fromEntries(Object.entries(fetched).sort(([first], [second]) => first.localeCompare(second)));
    writeFileSync(fetchedFile, `${JSON.stringify(sorted, null, 2)}\n`);
  }
};

export const readSnapshot = <Content>(name: string): Content => {
  const path = resolve(sourcesDir, name);
  if (!existsSync(path)) throw new Error(`${fromRepoRoot(path)} is missing: run npm run data:fetch`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

export const fetchText = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
};
