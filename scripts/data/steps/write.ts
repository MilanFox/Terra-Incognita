import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { byId } from '../model.ts';
import { fromRepoRoot, shippedDir } from '../paths.ts';
import { namesText } from './names.ts';
import type { Land, Tier } from '../model.ts';
import type { ShippedPlace } from './capitals.ts';
import type { Names } from './names.ts';

export type Version = { ne: string, counts: Record<Tier, number> };
export type Shipped = { map: Land, places: ShippedPlace[], names: Names, version: Version };

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

const placesText = (places: ShippedPlace[]) => `[\n${lineList([...places].sort(byId))}\n]\n`;

const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

export const write = ({ map, places, names, version }: Shipped) => {
  const files = {
    'map-dependencies.geojson': mapText(map),
    'places.json': placesText(places),
    'names.json': namesText(names),
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
