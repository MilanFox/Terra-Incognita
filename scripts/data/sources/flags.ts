import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { sourcesDir } from '../paths.ts';
import { flagLicencesName, flagSnapshotDir, flagSvgName, readFlagRulings, readShippedFlagPlaces, resolveFlagFiles } from './flag-files.ts';
import { readSnapshot, writeSnapshots } from './snapshot.ts';
import { wikidataSnapshotName } from './wikidata.ts';
import type { FlagLicence } from './flag-files.ts';
import type { WikidataBinding } from './wikidata.ts';

const headers = { 'User-Agent': 'terra-incognita-data-pipeline' };
const pauseBetweenRequestsMs = 750;
const attempts = 6;

const pause = (milliseconds: number) => new Promise(resolvePause => setTimeout(resolvePause, milliseconds));

const politeFetch = async (url: string) => {
  for (let attempt = 1; ; attempt++) {
    await pause(pauseBetweenRequestsMs);
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
    if (response.ok) return response;
    if (attempt === attempts || ![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`${url}: HTTP ${response.status}`);
    await pause(Number(response.headers.get('retry-after') ?? 0) * 1000 || 30_000 * attempt);
  }
};

const htmlEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

const textOfHtml = (html: string) => html
  .replace(/<[^>]*>/g, '')
  .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#x')) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    return htmlEntities[name.toLowerCase()] ?? entity;
  })
  .replace(/\s+/g, ' ')
  .trim();

const metadataValue = (metadata: Record<string, { value: string }>, field: string) => {
  const text = textOfHtml(metadata[field]?.value ?? '');
  return text || null;
};

const fetchFlag = async (file: string) => {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&format=json&formatversion=2&redirects=1'
    + `&iiextmetadatafilter=LicenseShortName|Artist|AttributionRequired|LicenseUrl&titles=${encodeURIComponent(`File:${file}`)}`;
  const { query } = await (await politeFetch(api)).json();
  const info = query.pages[0]?.imageinfo?.[0];
  if (!info) throw new Error(`${file} is not on Commons`);
  const metadata = info.extmetadata ?? {};
  const licence: FlagLicence = {
    file,
    license: metadataValue(metadata, 'LicenseShortName'),
    artist: metadataValue(metadata, 'Artist'),
    attributionRequired: metadata.AttributionRequired?.value === 'true',
    licenseUrl: metadataValue(metadata, 'LicenseUrl'),
  };
  const download = new URL(info.url);
  download.search = '';
  return { licence, svg: await (await politeFetch(download.href)).text() };
};

const licenceChanges = (previous: Record<string, FlagLicence>, current: Record<string, FlagLicence>) =>
  Object.entries(current).flatMap(([id, licence]) => {
    const before = previous[id];
    if (!before || before.file !== licence.file) return [];
    const fields = (['license', 'artist', 'attributionRequired', 'licenseUrl'] as const).filter(field => before[field] !== licence[field]);
    return fields.length ? [`${id} (${licence.file}): ${fields.map(field => `${field} "${before[field]}" -> "${licence[field]}"`).join(', ')}`] : [];
  });

export const fetchFlags = async () => {
  console.log('Wikimedia Commons flags');
  const { bindings } = readSnapshot<{ bindings: WikidataBinding[] }>(wikidataSnapshotName);
  const { files, failures } = resolveFlagFiles(readShippedFlagPlaces(), readFlagRulings(), bindings);
  if (failures.length) throw new Error(failures.join('\n'));
  const licences: Record<string, FlagLicence> = {};
  const snapshots: Record<string, string> = {};
  for (const [id, file] of Object.entries(files)) {
    console.log(`  ${id}: ${file}`);
    const fetched = await fetchFlag(file);
    licences[id] = fetched.licence;
    snapshots[`${flagSnapshotDir}/${flagSvgName(id)}`] = fetched.svg;
  }
  const licencesPath = resolve(sourcesDir, flagSnapshotDir, flagLicencesName);
  const previousLicences = existsSync(licencesPath) ? JSON.parse(readFileSync(licencesPath, 'utf8')) : {};
  snapshots[`${flagSnapshotDir}/${flagLicencesName}`] = `{\n${Object.entries(licences).map(([id, licence]) => `${JSON.stringify(id)}: ${JSON.stringify(licence)}`).join(',\n')}\n}\n`;
  writeSnapshots('flags', snapshots, {});
  const flagsDir = resolve(sourcesDir, flagSnapshotDir);
  for (const stale of readdirSync(flagsDir).filter(name => name.endsWith('.svg') && !(`${flagSnapshotDir}/${name}` in snapshots))) {
    rmSync(resolve(flagsDir, stale));
    console.log(`  removed     data/sources/${flagSnapshotDir}/${stale}`);
  }
  for (const change of licenceChanges(previousLicences, licences)) console.log(`  warn  licence changed: ${change}`);
};
