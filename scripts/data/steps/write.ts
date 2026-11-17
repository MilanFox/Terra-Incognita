import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { byId, tiers } from '../model.ts';
import { fromRepoRoot, shippedDir } from '../paths.ts';
import { chainOutlinesText } from './chains.ts';
import { namesText } from './names.ts';
import { pointsText } from './specks.ts';
import type { Land, Place } from '../model.ts';
import type { ChainOutline } from './chains.ts';
import type { TierMaps } from './dissolve.ts';
import type { Names } from './names.ts';
import type { SpeckPoint } from './specks.ts';
import type { TierFacts } from './tier-facts.ts';

export type ShippedPlace = Place & { flag: string | null, capitals: string[], ease: number } & TierFacts;
export type Shipped = { maps: TierMaps, places: ShippedPlace[], points: SpeckPoint[], chainOutlines: ChainOutline[], names: Names };

const lineList = (items: unknown[]) => items.map(item => JSON.stringify(item)).join(',\n');

export const mapText = (map: Land) => {
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

export const write = ({ maps, places, points, chainOutlines, names }: Shipped) => {
  const files = {
    ...Object.fromEntries(tiers.map(tier => [`map-${tier}.geojson`, mapText(maps[tier])])),
    'places.json': placesText(places),
    'points.geojson': pointsText(points),
    'chain-outlines.geojson': chainOutlinesText(chainOutlines),
    'names.json': namesText(names),
  };
  mkdirSync(shippedDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    const path = resolve(shippedDir, name);
    writeFileSync(path, text);
    const sizes = `${kilobytes(Buffer.byteLength(text))}, ${kilobytes(gzipSync(text).length)} gz`;
    console.log(`  ${fromRepoRoot(path)}: ${sizes}`);
  }
};
