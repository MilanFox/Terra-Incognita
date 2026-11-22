// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { featureCollection } from '../model.ts';
import { joinNames } from './names.ts';
import type { Place } from '../model.ts';
import type { AliasRulings } from './names.ts';

const congo: Place = {
  id: 'COD',
  qid: 'Q974',
  iso2: 'CD',
  tier: 'sovereign',
  holder: undefined,
  region: 'Africa',
  silhouette: true,
  silhouetteFrame: undefined,
  bbox: undefined,
};

const namesOfCongo = (aliasRulings: AliasRulings, wikidataLabels: Record<string, string> = {}) => {
  const { names } = joinNames([congo], {
    naturalEarth: { release: '5.1.2', countries: featureCollection([]), breakaway: featureCollection([]) },
    curated: { places: {}, features: {}, carve: {}, patches: [], duplicateKeys: [] },
  }, {
    cldr: { en: { CD: 'Congo - Kinshasa' }, de: { CD: 'Kongo-Kinshasa' } },
    mledoze: [],
    wikidata: new Map([['Q974', { labels: wikidataLabels, altLabels: { en: [], de: [] } }]]),
    aliasRulings,
  });
  return names.COD!;
};

describe('joinNames', () => {
  it('shows the curated display name and keeps the replaced one as an alias', () => {
    const { en } = namesOfCongo({ COD: { name: { en: 'DR Congo' } } });

    expect(en).toEqual({ name: 'DR Congo', aliases: ['Congo - Kinshasa'] });
  });

  it('keeps the replaced name as an alias even when the drop list names it', () => {
    const { en } = namesOfCongo({
      COD: { name: { en: 'DR Congo' }, drop: [{ lang: 'en', alias: 'Congo - Kinshasa', why: 'test' }] },
    }, { en: 'Congo - Kinshasa' });

    expect(en.aliases).toEqual(['Congo - Kinshasa']);
  });

  it('keeps the source name in a language without an override', () => {
    const { de } = namesOfCongo({ COD: { name: { en: 'DR Congo' } } });

    expect(de).toEqual({ name: 'Kongo-Kinshasa', aliases: [] });
  });
});
