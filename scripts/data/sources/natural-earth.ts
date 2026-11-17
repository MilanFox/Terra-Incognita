import { resolve } from 'node:path';
import { cacheDir } from '../paths.ts';
import { downloadPinned } from './pinned-file.ts';
import type { PinnedFile } from './pinned-file.ts';

export const naturalEarthRelease = '5.1.2';

const releaseUrl = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v${naturalEarthRelease}/geojson`;
const releaseCacheDir = resolve(cacheDir, `natural-earth-${naturalEarthRelease}`);

const pinned = (name: string, sha256: string): PinnedFile => ({
  url: `${releaseUrl}/${name}`,
  sha256,
  path: resolve(releaseCacheDir, name),
});

export const naturalEarthFiles = {
  countries: pinned(
    'ne_10m_admin_0_countries.geojson',
    '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255',
  ),
  breakaway: pinned(
    'ne_10m_admin_0_disputed_areas.geojson',
    '9cafef8b7dfb6b164dc58f218f981f4ace9f716f6c03795d4c62d1ac9f3d50f5',
  ),
};

export const fetchNaturalEarth = async () => {
  console.log(`Natural Earth v${naturalEarthRelease}`);
  for (const file of Object.values(naturalEarthFiles)) await downloadPinned(file);
};
