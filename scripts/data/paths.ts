import { relative, resolve } from 'node:path';

export const repoRoot = resolve(import.meta.dirname, '../..');
export const cacheDir = resolve(repoRoot, 'data/.cache');
export const sourcesDir = resolve(repoRoot, 'data/sources');
export const curatedDir = resolve(repoRoot, 'data/curated');
export const shippedDir = resolve(repoRoot, 'public/data');

export const fromRepoRoot = (path: string) => relative(repoRoot, path);
