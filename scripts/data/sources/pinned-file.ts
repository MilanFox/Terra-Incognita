import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fromRepoRoot } from '../paths.ts';

export type PinnedFile = { url: string, sha256: string, path: string };

const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const isCached = ({ path, sha256 }: PinnedFile) => existsSync(path) && sha256Of(readFileSync(path)) === sha256;

export const downloadPinned = async (file: PinnedFile) => {
  if (isCached(file)) {
    console.log(`  cached      ${fromRepoRoot(file.path)}`);
    return;
  }
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`${file.url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256Of(bytes);
  if (actual !== file.sha256) throw new Error(`${file.url}: sha256 is ${actual}, the pin expects ${file.sha256}`);
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(`${file.path}.part`, bytes);
  renameSync(`${file.path}.part`, file.path);
  console.log(`  downloaded  ${fromRepoRoot(file.path)}`);
};

export const readPinned = (file: PinnedFile) => {
  if (!existsSync(file.path)) throw new Error(`${fromRepoRoot(file.path)} is missing: run npm run data:fetch`);
  const bytes = readFileSync(file.path);
  if (sha256Of(bytes) !== file.sha256) {
    throw new Error(`${fromRepoRoot(file.path)} does not match its sha256 pin: run npm run data:fetch`);
  }
  return bytes.toString('utf8');
};
