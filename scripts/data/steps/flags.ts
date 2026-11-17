import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fromRepoRoot, shippedDir, sourcesDir } from '../paths.ts';
import { flagLicencesName, flagSnapshotDir, flagSvgName, readFlagRulings, resolveFlagFiles } from '../sources/flag-files.ts';
import { readSnapshot } from '../sources/snapshot.ts';
import { wikidataSnapshotName } from '../sources/wikidata.ts';
import type { FlagLicence, FlagPlace, FlagRulings } from '../sources/flag-files.ts';
import type { WikidataBinding } from '../sources/wikidata.ts';

export type Credit = { id: string, file: string, artist: string | null, license: string | null, licenseUrl: string | null };

export const maxShippedBytes = 2 * 1024 * 1024;

export type FlagSources = {
  bindings: WikidataBinding[]
  rulings: FlagRulings
  licences: Record<string, FlagLicence>
  previousCredits: Credit[] | undefined
};

export const loadFlagSources = (): FlagSources => {
  const creditsPath = resolve(shippedDir, 'credits.json');
  return {
    bindings: readSnapshot<{ bindings: WikidataBinding[] }>(wikidataSnapshotName).bindings,
    rulings: readFlagRulings(),
    licences: readSnapshot<Record<string, FlagLicence>>(`${flagSnapshotDir}/${flagLicencesName}`),
    previousCredits: existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, 'utf8')) : undefined,
  };
};

const withoutMetadataAndComments = (svg: string) => svg
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<metadata\b[^>]*\/>/gi, '')
  .replace(/<metadata\b[\s\S]*?<\/metadata\s*>/gi, '');

const rootTag = (svg: string) => /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';

const pixelAttribute = (tag: string, name: string) => {
  const value = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([^"']*?)\\s*(?:px)?\\s*["']`).exec(tag)?.[1];
  const pixels = Number(value);
  return value && pixels > 0 ? pixels : undefined;
};

// Many Commons flags only carry width and height; without a viewBox they cannot scale. The viewBox is that size.
const withViewBox = (svg: string) => {
  const tag = rootTag(svg);
  const [width, height] = [pixelAttribute(tag, 'width'), pixelAttribute(tag, 'height')];
  if (!tag || /\sviewBox\s*=/.test(tag) || !width || !height) return svg;
  return svg.replace(tag, tag.replace(/^<svg\b/, `<svg viewBox="0 0 ${width} ${height}"`));
};

export const hasViewBox = (svg: string) => /\sviewBox\s*=/.test(rootTag(svg));

export type FlagJoin = {
  flags: Record<string, string | null>
  svgs: Record<string, string>
  credits: Credit[]
  failures: { missingFiles: string[], mismatches: string[], resolution: string[] }
};

export const joinFlags = (places: FlagPlace[], sources: FlagSources): FlagJoin => {
  const { files, flagless, failures: resolution } = resolveFlagFiles(places, sources.rulings, sources.bindings);
  const flags: FlagJoin['flags'] = Object.fromEntries(flagless.map(id => [id, null]));
  const svgs: FlagJoin['svgs'] = {};
  const credits: Credit[] = [];
  const failures: FlagJoin['failures'] = { missingFiles: [], mismatches: [], resolution };
  for (const [id, file] of Object.entries(files)) {
    const svgPath = resolve(sourcesDir, flagSnapshotDir, flagSvgName(id));
    const licence = sources.licences[id];
    if (!existsSync(svgPath) || !licence) {
      failures.missingFiles.push(`${id} has no ${existsSync(svgPath) ? 'licence metadata' : 'flag SVG'} (${file}): run npm run data:fetch -- --flags`);
      continue;
    }
    if (licence.file !== file) failures.mismatches.push(`${id}: the snapshot is of ${licence.file}, the ruling is ${file}: run npm run data:fetch -- --flags`);
    flags[id] = flagSvgName(id);
    svgs[id] = withViewBox(withoutMetadataAndComments(readFileSync(svgPath, 'utf8')));
    if (licence.attributionRequired) credits.push({ id, file, artist: licence.artist, license: licence.license, licenseUrl: licence.licenseUrl });
  }
  return { flags, svgs, credits, failures };
};

const noticesSources = [
  { title: 'Unicode CLDR (territory names): Unicode License v3', file: 'unicode-license-v3.txt' },
  { title: 'MapLibre GL JS 6.19.0 (map renderer): BSD 3-Clause, from the upstream tag v6.19.0', file: 'maplibre-gl-js-LICENSE.txt' },
  { title: 'mledoze/countries (part of the aliases): Open Database License 1.0', file: 'mledoze-odbl-notice.txt' },
];

export const noticesText = () => {
  const rule = '='.repeat(78);
  const sections = noticesSources.map(({ title, file }) =>
    `${rule}\n${title}\n${rule}\n\n${readFileSync(resolve(sourcesDir, 'licences', file), 'utf8').trim()}\n`);
  return `THIRD-PARTY NOTICES\n\n${sections.join('\n')}`;
};

const lineList = (items: unknown[]) => items.map(item => JSON.stringify(item)).join(',\n');

export const creditsText = (credits: Credit[]) => `[\n${lineList(credits)}\n]\n`;

export const writeFlagFiles = ({ svgs, credits }: Pick<FlagJoin, 'svgs' | 'credits'>) => {
  const flagsDir = resolve(shippedDir, 'flags');
  rmSync(flagsDir, { recursive: true, force: true });
  mkdirSync(flagsDir, { recursive: true });
  for (const [id, svg] of Object.entries(svgs)) writeFileSync(resolve(flagsDir, flagSvgName(id)), svg);
  const bytes = Object.values(svgs).map(svg => Buffer.byteLength(svg));
  console.log(`  ${fromRepoRoot(flagsDir)}/: ${bytes.length} flags, ${Math.round(bytes.reduce((sum, size) => sum + size, 0) / 1024)} KB, largest ${Math.round(Math.max(...bytes) / 1024)} KB`);
  for (const [name, text] of [['credits.json', creditsText(credits)], ['THIRD-PARTY-NOTICES.txt', noticesText()]]) {
    writeFileSync(resolve(shippedDir, name!), text!);
    console.log(`  ${fromRepoRoot(resolve(shippedDir, name!))}: ${Math.round(Buffer.byteLength(text!) / 1024)} KB`);
  }
};
