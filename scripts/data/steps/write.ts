import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { byId, tiers } from '../model.ts';
import { fromRepoRoot, shippedDir } from '../paths.ts';
import type { Land, Place, Tier } from '../model.ts';
import type { TierMaps } from './dissolve.ts';

export type Version = { ne: string, counts: Record<Tier, number> };
export type Shipped = { maps: TierMaps, places: Place[], version: Version };

const lineList = (items: unknown[]) => items.map(item => JSON.stringify(item)).join(',\n');

const mapText = (map: Land) => {
  const features = [...map.features]
    .sort((first, second) => byId(first.properties, second.properties))
    .map(({ properties: { id, unclaimed }, geometry }) => ({
      type: 'Feature',
      properties: unclaimed ? { id, unclaimed } : { id },
      geometry,
    }));
  return `{"type":"FeatureCollection","features":[\n${lineList(features)}\n]}\n`;
};

const placesText = (places: Place[]) => `[\n${lineList([...places].sort(byId))}\n]\n`;

const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

export const write = ({ maps, places, version }: Shipped) => {
  const files = {
    ...Object.fromEntries(tiers.map(tier => [`map-${tier}.geojson`, mapText(maps[tier])])),
    'places.json': placesText(places),
    'version.json': `${JSON.stringify(version, null, 2)}\n`,
  };
  mkdirSync(shippedDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    const path = resolve(shippedDir, name);
    writeFileSync(path, text);
    const sizes = `${kilobytes(Buffer.byteLength(text))}, ${kilobytes(gzipSync(text).length)} gz`;
    console.log(`  ${fromRepoRoot(path)}: ${sizes}`);
  }
};
