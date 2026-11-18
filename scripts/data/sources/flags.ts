import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { connect } from 'node:http2';
import { resolve } from 'node:path';
import { sourcesDir } from '../paths.ts';
import { flagLicencesName, flagSnapshotDir, flagSvgName, readFlagRulings, readShippedFlagPlaces, resolveFlagFiles, withLineFeeds } from './flag-files.ts';
import { readSnapshot, writeSnapshots } from './snapshot.ts';
import { wikidataSnapshotName } from './wikidata.ts';
import type { FlagLicence } from './flag-files.ts';
import type { WikidataBinding } from './wikidata.ts';

const headers = { 'User-Agent': `terra-incognita-data-pipeline/1.0 node/${process.versions.node}` };
const pauseBetweenRequestsMs = 750;
const attempts = 6;
const requestTimeoutMs = 60_000;
const titlesPerRequest = 50;
const diagnosticHeaders = ['retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'content-type', 'server', 'x-request-id'];

const pause = (milliseconds: number) => new Promise(resolvePause => setTimeout(resolvePause, milliseconds));

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

const failureDetails = async (response: Response) => {
  const shownHeaders = diagnosticHeaders.flatMap(name => (response.headers.has(name) ? [`${name}: ${response.headers.get(name)}`] : []));
  const html = (await response.text().catch(() => '')).replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, '');
  const body = textOfHtml(html).split('Sensitive client information')[0]!.trim().slice(0, 300);
  return [...shownHeaders, ...(body ? [`body: ${body}`] : [])].join('; ');
};

const fetchOverHttp1 = (url: string) => fetch(url, { headers, signal: AbortSignal.timeout(requestTimeoutMs) });

// upload.wikimedia.org answers 429 after a few requests in a row to clients that speak HTTP/1.1, as Node's fetch does,
// or that send no Accept header. HTTP/2 requests with one are served at the same pace.
const fetchOverHttp2 = (url: string) => new Promise<Response>((resolveResponse, reject) => {
  const { origin, pathname, search } = new URL(url);
  const session = connect(origin);
  const fail = (error: Error) => {
    session.destroy();
    reject(error);
  };
  session.on('error', fail);
  const request = session.request({ ':path': pathname + search, 'user-agent': headers['User-Agent'], 'accept': '*/*' });
  request.setTimeout(requestTimeoutMs, () => fail(new Error(`${url}: no answer within ${requestTimeoutMs / 1000} s`)));
  request.on('error', fail);
  request.on('response', (responseHeaders) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      session.close();
      const plainHeaders = Object.entries(responseHeaders).flatMap(([name, value]) => (name.startsWith(':') ? [] : [[name, String(value)] as [string, string]]));
      resolveResponse(new Response(Buffer.concat(chunks), { status: Number(responseHeaders[':status']), headers: plainHeaders }));
    });
  });
  request.end();
});

const politeFetch = async (url: string, send = fetchOverHttp1) => {
  for (let attempt = 1; ; attempt++) {
    await pause(pauseBetweenRequestsMs);
    const response = await send(url);
    if (response.ok) return response;
    if (attempt === attempts || ![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`${url}: HTTP ${response.status} (${await failureDetails(response)})`);
    const waitMs = Number(response.headers.get('retry-after') ?? 0) * 1000 || 30_000 * attempt;
    console.log(`  HTTP ${response.status}, attempt ${attempt} of ${attempts}, waiting ${Math.round(waitMs / 1000)} s`);
    await response.body?.cancel();
    await pause(waitMs);
  }
};

const metadataValue = (metadata: Record<string, { value: string }>, field: string) => {
  const text = textOfHtml(metadata[field]?.value ?? '');
  return text || null;
};

type CommonsFile = { licence: FlagLicence, url: string };
type CommonsImageInfo = { url: string, sha1: string, extmetadata?: Record<string, { value: string }> };
type CommonsQuery = {
  normalized?: { from: string, to: string }[]
  redirects?: { from: string, to: string }[]
  pages?: { title: string, imageinfo?: CommonsImageInfo[] }[]
};

const fetchImageInfos = async (files: string[]) => {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|sha1|extmetadata&format=json&formatversion=2&redirects=1'
    + `&iiextmetadatafilter=LicenseShortName|Artist|AttributionRequired|LicenseUrl&titles=${encodeURIComponent(files.map(file => `File:${file}`).join('|'))}`;
  const renamed = new Map<string, string>();
  const infoByTitle = new Map<string, CommonsImageInfo>();
  for (let continuation: Record<string, string> | undefined = {}; continuation;) {
    const { query, continue: next }: { query?: CommonsQuery, continue?: Record<string, string> } = await (await politeFetch(`${api}&${new URLSearchParams(continuation)}`)).json();
    for (const { from, to } of [...(query?.normalized ?? []), ...(query?.redirects ?? [])]) renamed.set(from, to);
    for (const { title, imageinfo } of query?.pages ?? []) if (imageinfo?.[0]) infoByTitle.set(title, imageinfo[0]);
    continuation = next;
  }
  return files.map((file) => {
    const normalised = renamed.get(`File:${file}`) ?? `File:${file}`;
    const info = infoByTitle.get(renamed.get(normalised) ?? normalised);
    if (!info) throw new Error(`${file} is not on Commons`);
    return [file, info] as const;
  });
};

const fetchCommonsFiles = async (files: string[]) => {
  const commonsFiles = new Map<string, CommonsFile>();
  for (let first = 0; first < files.length; first += titlesPerRequest) {
    for (const [file, info] of await fetchImageInfos(files.slice(first, first + titlesPerRequest))) {
      const metadata = info.extmetadata ?? {};
      commonsFiles.set(file, {
        licence: {
          file,
          license: metadataValue(metadata, 'LicenseShortName'),
          artist: metadataValue(metadata, 'Artist'),
          attributionRequired: metadata.AttributionRequired?.value === 'true',
          licenseUrl: metadataValue(metadata, 'LicenseUrl'),
          sha1: info.sha1,
        },
        url: info.url,
      });
    }
  }
  return commonsFiles;
};

const downloadFlag = async (url: string) => {
  const download = new URL(url);
  download.search = '';
  return withLineFeeds(await (await politeFetch(download.href, fetchOverHttp2)).text());
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
  const licencesPath = resolve(sourcesDir, flagSnapshotDir, flagLicencesName);
  const previousLicences: Record<string, FlagLicence> = existsSync(licencesPath) ? JSON.parse(readFileSync(licencesPath, 'utf8')) : {};
  const commonsFiles = await fetchCommonsFiles([...new Set(Object.values(files))]);
  const licences: Record<string, FlagLicence> = {};
  const snapshots: Record<string, string> = {};
  for (const [id, file] of Object.entries(files)) {
    const { licence, url } = commonsFiles.get(file)!;
    const svgPath = resolve(sourcesDir, flagSnapshotDir, flagSvgName(id));
    const previous = previousLicences[id];
    const unchanged = previous?.file === file && previous.sha1 === licence.sha1 && existsSync(svgPath);
    if (!unchanged) console.log(`  ${id}: ${file}`);
    licences[id] = licence;
    snapshots[`${flagSnapshotDir}/${flagSvgName(id)}`] = unchanged ? readFileSync(svgPath, 'utf8') : await downloadFlag(url);
  }
  snapshots[`${flagSnapshotDir}/${flagLicencesName}`] = `{\n${Object.entries(licences).map(([id, licence]) => `${JSON.stringify(id)}: ${JSON.stringify(licence)}`).join(',\n')}\n}\n`;
  writeSnapshots('flags', snapshots, {});
  const flagsDir = resolve(sourcesDir, flagSnapshotDir);
  for (const stale of readdirSync(flagsDir).filter(name => name.endsWith('.svg') && !(`${flagSnapshotDir}/${name}` in snapshots))) {
    rmSync(resolve(flagsDir, stale));
    console.log(`  removed     data/sources/${flagSnapshotDir}/${stale}`);
  }
  for (const change of licenceChanges(previousLicences, licences)) console.log(`  warn  licence changed: ${change}`);
};
