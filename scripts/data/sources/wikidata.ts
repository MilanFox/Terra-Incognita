import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shippedDir } from '../paths.ts';
import { fetchText, writeSnapshots } from './snapshot.ts';

export const wikidataSnapshotName = 'wikidata.json';

// Abkhazia's flag sits on another item than its place (D4). The capitals are the ones D4 overrides: Ramallah,
// Tifariti, Jerusalem and Jamestown, fetched whether or not P36 lists them.
const extraItems = ['Q31354462'];
const overrideCapitals = ['Q158119', 'Q2360337', 'Q1218', 'Q30970'];

export type WikidataBinding = {
  item?: { value: string }
  capital?: { value: string }
  kind: { value: string }
  text?: { 'value': string, 'xml:lang'?: string }
};

const entityValues = (qids: string[]) => qids.map(qid => `wd:${qid}`).join(' ');

const queryFor = (itemQids: string[]) => `
SELECT ?item ?kind ?capital ?text WHERE {
  {
    VALUES ?item { ${entityValues(itemQids)} }
    { ?item rdfs:label ?text . BIND("label" AS ?kind) }
    UNION { ?item skos:altLabel ?text . BIND("altLabel" AS ?kind) }
    UNION {
      ?item p:P41 ?flagStatement .
      ?flagStatement ps:P41 ?flagFile ; wikibase:rank ?flagRank .
      FILTER NOT EXISTS { ?flagStatement pq:P582 ?flagEnd }
      FILTER (?flagRank != wikibase:DeprecatedRank)
      BIND(STR(?flagFile) AS ?text) BIND("flag" AS ?kind)
    }
    UNION {
      ?item p:P36 ?capitalStatement .
      ?capitalStatement ps:P36 ?capital ; wikibase:rank ?capitalRank .
      FILTER NOT EXISTS { ?capitalStatement pq:P582 ?capitalEnd }
      FILTER (?capitalRank != wikibase:DeprecatedRank)
      { BIND("capital" AS ?kind) }
      UNION { ?capital rdfs:label ?text . BIND("capitalLabel" AS ?kind) }
      UNION { ?capital skos:altLabel ?text . BIND("capitalAltLabel" AS ?kind) }
      UNION { ?capital wdt:P625 ?coordinates . BIND(STR(?coordinates) AS ?text) BIND("capitalCoordinates" AS ?kind) }
    }
  }
  UNION {
    VALUES ?capital { ${entityValues(overrideCapitals)} }
    { ?capital rdfs:label ?text . BIND("capitalLabel" AS ?kind) }
    UNION { ?capital skos:altLabel ?text . BIND("capitalAltLabel" AS ?kind) }
    UNION { ?capital wdt:P625 ?coordinates . BIND(STR(?coordinates) AS ?text) BIND("capitalCoordinates" AS ?kind) }
  }
  FILTER (!BOUND(?text) || LANG(?text) IN ("en", "de", "mul", ""))
}`;

const placeQids = (): string[] => {
  const places: { qid: string }[] = JSON.parse(readFileSync(resolve(shippedDir, 'places.json'), 'utf8'));
  return places.map(({ qid }) => qid);
};

const sortKey = ({ item, capital, kind, text }: WikidataBinding) =>
  [item?.value, capital?.value, kind.value, text?.['xml:lang'], text?.value].join('\t');

export const fetchWikidata = async () => {
  console.log('Wikidata (SPARQL)');
  const itemQids = [...new Set([...placeQids(), ...extraItems])].sort();
  const response = await fetchText('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      'User-Agent': 'terra-incognita-data-pipeline',
      'Accept': 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query: queryFor(itemQids), format: 'json' }),
  });
  const { results } = JSON.parse(response);
  const bindings = results.bindings as WikidataBinding[];
  const lines = bindings
    .map(binding => ({ sort: sortKey(binding), text: JSON.stringify(binding) }))
    .sort((first, second) => (first.sort < second.sort ? -1 : Number(first.sort > second.sort)))
    .map(({ text }) => `  ${text}`);
  const snapshot = `{"bindings":[\n${[...new Set(lines)].join(',\n')}\n]}\n`;
  writeSnapshots('wikidata', { [wikidataSnapshotName]: snapshot }, {});
};
