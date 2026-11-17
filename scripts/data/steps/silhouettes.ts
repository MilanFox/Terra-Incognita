import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pieceAreaKm2 } from '../land-area.ts';
import { byId, polygonsOf } from '../model.ts';
import { fromRepoRoot, reviewDir } from '../paths.ts';
import type { Bbox, Land, Place, Ring } from '../model.ts';
import type { NaturalEarth } from './load.ts';

export type SilhouetteCandidate = { id: string, name: string, reasons: string[] };

const earthRadiusKm = 6371.0088;
const radians = Math.PI / 180;
const cellPx = 170;
const paddingPx = 10;

const tinyAreaKm2 = 100;
const fragmentedPieceCount = 8;
const fragmentedLargestShare = 0.5;
const elongatedAspect = 5;
const sparseLandShare = 0.02;

const namesWithoutNeFeature: Record<string, string> = {
  B35: 'Abkhazia',
  B36: 'Transnistria',
  B37: 'South Ossetia',
  CCK: 'Cocos Islands',
  CXR: 'Christmas Island',
};

const placeNames = (naturalEarth: NaturalEarth) => new Map([
  ...Object.entries(namesWithoutNeFeature),
  ...naturalEarth.countries.features.map(({ properties }): [string, string] => [properties.ADM0_A3, properties.ADMIN]),
]);

// Longitude measured east from the bbox's west edge, so a place across the antimeridian stays in one piece.
const projector = ([west, south, east, north]: Bbox) => {
  const lonSpan = east >= west ? east - west : east + 360 - west;
  const latSpan = north - south;
  const lonScale = Math.cos(((south + north) / 2) * Math.PI / 180);
  const widthUnits = Math.max(lonSpan * lonScale, 1e-6);
  const heightUnits = Math.max(latSpan, 1e-6);
  const scale = (cellPx - 2 * paddingPx) / Math.max(widthUnits, heightUnits);
  const offsetX = (cellPx - widthUnits * scale) / 2;
  const offsetY = (cellPx - heightUnits * scale) / 2;
  const project = ([lon, lat]: [number, number]) => {
    const eastward = (lon - west + 720) % 360;
    return [offsetX + eastward * lonScale * scale, offsetY + (north - lat) * scale] as const;
  };
  const bboxAreaKm2 = earthRadiusKm ** 2 * lonSpan * radians * (Math.sin(north * radians) - Math.sin(south * radians));
  return { project, bboxAreaKm2, aspect: Math.max(widthUnits / heightUnits, heightUnits / widthUnits) };
};

const pathOf = (rings: Ring[][], project: ReturnType<typeof projector>['project']) => rings
  .flatMap(polygon => polygon)
  .map(ring => `M${ring.map(vertex => project(vertex).map(value => value.toFixed(1)).join(' ')).join('L')}Z`)
  .join('');

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const reasonsFor = (pieceAreas: number[], { aspect, bboxAreaKm2 }: { aspect: number, bboxAreaKm2: number }) => {
  const areaKm2 = pieceAreas.reduce((sum, area) => sum + area, 0);
  const reasons: string[] = [];
  const largestShare = Math.max(...pieceAreas) / areaKm2;
  if (areaKm2 < tinyAreaKm2) reasons.push(`tiny: ${areaKm2.toFixed(1)} km² of land`);
  if (pieceAreas.length >= fragmentedPieceCount && largestShare < fragmentedLargestShare) {
    reasons.push(`fragmented: ${pieceAreas.length} pieces, the largest ${Math.round(largestShare * 100)}% of the land`);
  }
  if (aspect > elongatedAspect) reasons.push(`elongated: aspect ${aspect.toFixed(1)}:1`);
  if (areaKm2 / bboxAreaKm2 < sparseLandShare) reasons.push(`sparse: land is ${(areaKm2 / bboxAreaKm2 * 100).toFixed(2)}% of its bounding box`);
  return reasons;
};

export const silhouetteSheet = (dependenciesMap: Land, places: Place[], naturalEarth: NaturalEarth) => {
  const names = placeNames(naturalEarth);
  const geometryById = new Map(dependenciesMap.features.map(({ properties, geometry }) => [properties.id, geometry]));
  const candidates: SilhouetteCandidate[] = [];
  const cells = [...places].sort(byId).map(({ id, bbox }) => {
    const name = names.get(id) ?? id;
    const polygons = polygonsOf(geometryById.get(id) ?? null);
    if (!bbox || !polygons.length) return `<figure class="flagged"><figcaption><b>${id}</b> ${escapeHtml(name)}<br>no land</figcaption></figure>`;
    const { project, aspect, bboxAreaKm2 } = projector(bbox);
    const pieceAreas = polygons.map(pieceAreaKm2);
    const reasons = reasonsFor(pieceAreas, { aspect, bboxAreaKm2 });
    if (reasons.length) candidates.push({ id, name, reasons });
    const label = `<b>${id}</b> ${escapeHtml(name)}`;
    const reasonList = reasons.map(reason => `<br><span>${reason}</span>`).join('');
    return `<figure${reasons.length ? ' class="flagged"' : ''}>`
      + `<svg viewBox="0 0 ${cellPx} ${cellPx}" role="img" aria-label="${id} ${escapeHtml(name)}">`
      + `<path fill-rule="evenodd" d="${pathOf(polygons, project)}"/></svg>`
      + `<figcaption>${label}${reasonList}</figcaption></figure>`;
  });
  const style = `body{font:14px system-ui,sans-serif;margin:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${cellPx}px,1fr));gap:8px}
figure{margin:0;border:1px solid #ccc;border-radius:4px;padding:4px}
figure.flagged{border:2px solid #c0392b;background:#fdf0ee}
svg{width:100%;height:auto;display:block;background:#fff}path{fill:#222;stroke:#222;stroke-width:2.5;stroke-linejoin:round;vector-effect:non-scaling-stroke}
figcaption{font-size:12px;padding-top:4px}figcaption span{color:#c0392b}`;
  const text = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Silhouette contact sheet</title>`
    + `<style>${style}</style></head><body>\n`
    + `<h1>Silhouette contact sheet</h1>\n<p>${places.length} places, ${candidates.length} flagged as candidates (red). `
    + `Silhouettes are each place's own land, scaled to its own bounding box. `
    + `Write the unreadable ones as <code>silhouette: false</code> in <code>data/curated/places.json</code>.</p>\n`
    + `<div class="grid">\n${cells.join('\n')}\n</div></body></html>\n`;
  return { text, candidates };
};

export const writeSilhouetteSheet = (sheet: ReturnType<typeof silhouetteSheet>) => {
  const path = resolve(reviewDir, 'silhouettes/index.html');
  mkdirSync(resolve(reviewDir, 'silhouettes'), { recursive: true });
  writeFileSync(path, sheet.text);
  console.log(`  ${fromRepoRoot(path)}: ${(Buffer.byteLength(sheet.text) / 1024).toFixed(0)} KB, ${sheet.candidates.length} flagged`);
  for (const { id, name, reasons } of sheet.candidates) console.log(`    ${id} ${name}: ${reasons.join('; ')}`);
};
