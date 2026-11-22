import { describe, expect, it } from 'vitest';
import shippedNames from '../../public/data/names.json';
import { createMatcher } from './matcher';
import type { NamesFile } from './matcher';

const names = shippedNames as NamesFile;
const matcher = createMatcher(names);

const resolvedTo = (typed: string) => {
  const resolution = matcher.resolve(typed);
  return resolution.outcome === 'match' ? resolution.placeId : resolution.outcome;
};

const placeNameTraps: Record<string, [typed: string, expected: string][]> = {
  'Niger / Nigeria': [
    ['niger', 'NER'],
    ['nigeria', 'NGA'],
    ['Nigeria ', 'NGA'],
    ['nigera', 'ambiguous'],
    ['nigeri', 'ambiguous'],
    ['nigr', 'NER'],
  ],
  'Guinea family': [
    ['guinea', 'GIN'],
    ['guinea bissau', 'GNB'],
    ['guinea-bissau', 'GNB'],
    ['guineabissau', 'GNB'],
    ['guinea bisau', 'GNB'],
    ['guinae', 'GIN'],
    ['guinea conakry', 'GIN'],
    ['papua', 'PNG'],
    ['papua new guinea', 'PNG'],
    ['papua neuguinea', 'PNG'],
    ['equatorial guinea', 'GNQ'],
    ['equatorial', 'GNQ'],
    ['aequatorialguinea', 'GNQ'],
    ['äquatorialguinea', 'GNQ'],
    ['aquatorialguinea', 'GNQ'],
    ['new guinea', 'none'],
  ],
  'Congo / DR Congo': [
    ['congo', 'ambiguous'],
    ['kongo', 'ambiguous'],
    ['drc', 'COD'],
    ['dr congo', 'COD'],
    ['drcongo', 'COD'],
    ['dr kongo', 'COD'],
    ['congo kinshasa', 'COD'],
    ['kongo-kinshasa', 'COD'],
    ['democratic republic of the congo', 'COD'],
    ['demokratische republik kongo', 'COD'],
    ['congo brazzaville', 'COG'],
    ['congo brazaville', 'COG'],
    ['kongo-brazzaville', 'COG'],
    ['republic of congo', 'COG'],
    ['republic of the congo', 'COG'],
    ['republik kongo', 'COG'],
  ],
  'Dominica / Dominican Republic': [
    ['dominica', 'DMA'],
    ['dominican', 'DOM'],
    ['dominican republic', 'DOM'],
    ['dominikanische republik', 'DOM'],
    ['dominca', 'DMA'],
    ['dominicana', 'DOM'],
    ['dominika', 'DMA'],
  ],
  'Sudan / South Sudan': [
    ['sudan', 'SDN'],
    ['the sudan', 'SDN'],
    ['south sudan', 'SDS'],
    ['südsudan', 'SDS'],
    ['sudsudan', 'SDS'],
    ['suedsudan', 'SDS'],
    ['sudn', 'SDN'],
    ['south', 'ambiguous'],
  ],
  'Austria / Australia': [
    ['austria', 'AUT'],
    ['australia', 'AUS'],
    ['österreich', 'AUT'],
    ['australien', 'AUS'],
    ['austrlia', 'ambiguous'],
    ['austira', 'AUT'],
    ['australa', 'AUS'],
    ['austrailia', 'AUS'],
  ],
  'Iran / Iraq': [
    ['iran', 'IRN'],
    ['iraq', 'IRQ'],
    ['irak', 'IRQ'],
    ['iraj', 'ambiguous'],
    ['persia', 'IRN'],
    ['irn', 'IRN'],
  ],
  'Mali / Malawi': [
    ['mali', 'MLI'],
    ['malawi', 'MWI'],
    ['malai', 'ambiguous'],
    ['mallawi', 'MWI'],
    ['mal', 'MLI'],
  ],
  'Slovakia / Slovenia': [
    ['slovakia', 'SVK'],
    ['slovenia', 'SVN'],
    ['slowakei', 'SVK'],
    ['slowenien', 'SVN'],
    ['slovania', 'ambiguous'],
    ['slovkia', 'SVK'],
    ['slovnia', 'SVN'],
    ['slowenia', 'SVN'],
  ],
  'Korea': [
    ['korea', 'ambiguous'],
    ['north korea', 'PRK'],
    ['nort korea', 'PRK'],
    ['nordkorea', 'PRK'],
    ['dprk', 'PRK'],
    ['south korea', 'KOR'],
    ['südkorea', 'KOR'],
    ['suedkorea', 'KOR'],
    ['sudkorea', 'KOR'],
  ],
  'Samoa / American Samoa': [
    ['samoa', 'WSM'],
    ['samao', 'WSM'],
    ['western samoa', 'WSM'],
    ['american samoa', 'ASM'],
    ['amerikanisch samoa', 'ASM'],
    ['amerikanisch-samoa', 'ASM'],
  ],
  'Georgia': [
    ['georgia', 'GEO'],
    ['georgien', 'GEO'],
    ['gorgia', 'GEO'],
  ],
  'Macedonia': [
    ['macedonia', 'MKD'],
    ['north macedonia', 'MKD'],
    ['mazedonien', 'MKD'],
    ['nordmazedonien', 'MKD'],
    ['macedona', 'MKD'],
  ],
  'Czechia': [
    ['czechia', 'CZE'],
    ['czech republic', 'CZE'],
    ['czech', 'CZE'],
    ['tschechien', 'CZE'],
    ['tschechische republik', 'CZE'],
    ['chechia', 'CZE'],
    ['czechoslovakia', 'none'],
  ],
  'Côte d\'Ivoire': [
    ['côte d\'ivoire', 'CIV'],
    ['cote d ivoire', 'CIV'],
    ['cote divoire', 'CIV'],
    ['ivory coast', 'CIV'],
    ['ivory', 'CIV'],
    ['elfenbeinküste', 'CIV'],
    ['elfenbeinkueste', 'CIV'],
    ['elfenbeinkuste', 'CIV'],
  ],
  'Eswatini': [
    ['eswatini', 'SWZ'],
    ['swaziland', 'SWZ'],
    ['swasiland', 'SWZ'],
  ],
  'Myanmar': [
    ['myanmar', 'MMR'],
    ['burma', 'MMR'],
    ['birma', 'MMR'],
    ['myanma', 'MMR'],
  ],
  'Türkiye': [
    ['türkiye', 'TUR'],
    ['turkiye', 'TUR'],
    ['turkey', 'TUR'],
    ['türkei', 'TUR'],
    ['turkei', 'TUR'],
    ['tuerkei', 'TUR'],
  ],
  'Display names that replaced the CLDR/NE labels': [
    ['nauru', 'NRU'],
    ['naoero', 'NRU'],
    ['kongo-brazzaville', 'COG'],
    ['congo-brazzaville', 'COG'],
    ['republic of the congo', 'COG'],
    ['republik kongo', 'COG'],
    ['kongo', 'ambiguous'],
    ['congo', 'ambiguous'],
    ['cape verde', 'CPV'],
    ['cabo verde', 'CPV'],
    ['hong kong sar china', 'HKG'],
    ['hongkong', 'HKG'],
    ['macao sar china', 'MAC'],
    ['macao', 'MAC'],
    ['macau', 'MAC'],
    ['åland islands', 'ALD'],
    ['ålandinseln', 'ALD'],
    ['brunei', 'BRN'],
    ['vietnam', 'VNM'],
    ['viet nam', 'VNM'],
    ['st. lucia', 'LCA'],
    ['saint lucia', 'LCA'],
    ['bahamas', 'BHS'],
    ['the bahamas', 'BHS'],
  ],
  'Gambia / Zambia': [
    ['gambia', 'GMB'],
    ['the gambia', 'GMB'],
    ['zambia', 'ZMB'],
    ['sambia', 'ZMB'],
    ['gamiba', 'GMB'],
    ['zambai', 'ZMB'],
    ['ambia', 'ambiguous'],
    ['sambja', 'ZMB'],
  ],
  'Ireland / Iceland': [
    ['ireland', 'IRL'],
    ['iceland', 'ISL'],
    ['irland', 'IRL'],
    ['island', 'ISL'],
    ['ieland', 'ambiguous'],
    ['icland', 'ambiguous'],
    ['irelnd', 'IRL'],
  ],
  'Estland / Lettland': [
    ['estland', 'EST'],
    ['lettland', 'LVA'],
    ['estonia', 'EST'],
    ['latvia', 'LVA'],
    ['estlnd', 'EST'],
    ['lettand', 'LVA'],
  ],
  'German umlauts and ß': [
    ['oesterreich', 'AUT'],
    ['osterreich', 'AUT'],
    ['österreich', 'AUT'],
    ['Österreich', 'AUT'],
    ['weissrussland', 'BLR'],
    ['weißrussland', 'BLR'],
    ['großbritannien', 'GBR'],
    ['grossbritannien', 'GBR'],
    ['suedafrika', 'ZAF'],
    ['sudafrika', 'ZAF'],
    ['dänemark', 'DNK'],
    ['daenemark', 'DNK'],
    ['danemark', 'DNK'],
    ['tuerkei', 'TUR'],
  ],
  'St. Kitts': [
    ['st kitts', 'KNA'],
    ['saint kitts', 'KNA'],
    ['sankt kitts', 'KNA'],
    ['st. kitts', 'KNA'],
    ['St. Kitts und Nevis', 'KNA'],
    ['saint kitts and nevis', 'KNA'],
    ['st kitts & nevis', 'KNA'],
    ['kitts', 'KNA'],
  ],
  'United …': [
    ['united', 'ambiguous'],
    ['vereinigte', 'ambiguous'],
    ['uk', 'GBR'],
    ['usa', 'USA'],
    ['uae', 'ARE'],
  ],
  'Required typos': [
    ['grmany', 'DEU'],
    ['germnay', 'DEU'],
    ['deutschlnd', 'DEU'],
  ],
  'Pair scan finds (real data)': [
    ['albnia', 'ambiguous'],
    ['syria', 'SYR'],
    ['sria', 'SYR'],
    ['aman', 'OMN'],
    ['st martin', 'MAF'],
    ['sint maarten', 'SXM'],
    ['sitmartin', 'ambiguous'],
  ],
  'Pool scope (run with all places)': [
    ['somaliand', 'SOL'],
    ['somalia', 'SOM'],
    ['somaliland', 'SOL'],
  ],
};

describe('answer matcher', () => {
  it('knows all 245 places', () => {
    expect(Object.keys(names).filter(key => !key.startsWith('_'))).toHaveLength(245);
  });

  describe('place-name traps from the answer-matching prototype', () => {
    for (const [group, traps] of Object.entries(placeNameTraps)) {
      it(group, () => {
        for (const [typed, expected] of traps) {
          expect(resolvedTo(typed), typed).toBe(expected);
        }
      });
    }
  });

  describe('normalisation', () => {
    it('ignores case, surrounding spaces and punctuation', () => {
      expect(resolvedTo('  FRANCE ')).toBe('FRA');
      expect(resolvedTo('Côte d\'Ivoire')).toBe('CIV');
    });

    it('folds ß, umlauts and letters without a decomposition', () => {
      expect(resolvedTo('Weißrussland')).toBe('BLR');
      expect(resolvedTo('Österreich')).toBe('AUT');
      expect(resolvedTo('Oesterreich')).toBe('AUT');
      expect(resolvedTo('Føroyar')).toBe('FRO');
    });

    it('treats saint, sankt and st alike and und, and and & alike', () => {
      expect(resolvedTo('Saint Kitts and Nevis')).toBe('KNA');
      expect(resolvedTo('Sankt Kitts und Nevis')).toBe('KNA');
      expect(resolvedTo('St. Kitts & Nevis')).toBe('KNA');
    });

    it('drops the token "the"', () => {
      expect(resolvedTo('The Gambia')).toBe('GMB');
    });
  });

  describe('prefix rows', () => {
    it('accepts a whole-token prefix that belongs to one place', () => {
      expect(resolvedTo('papua')).toBe('PNG');
      expect(resolvedTo('ivory')).toBe('CIV');
    });

    it('does not give a row to a prefix under four letters', () => {
      expect(resolvedTo('new')).toBe('none');
    });

    it('does not give a row to a mid-token prefix', () => {
      expect(resolvedTo('papu')).toBe('PNG');
      expect(resolvedTo('equator')).toBe('none');
    });

    it('treats a shared prefix typed exactly as ambiguous', () => {
      expect(resolvedTo('united')).toBe('ambiguous');
      expect(resolvedTo('korea')).toBe('ambiguous');
    });

    it('does not let a prefix shadow another place\'s full name', () => {
      expect(resolvedTo('dominica')).toBe('DMA');
      expect(resolvedTo('samoa')).toBe('WSM');
    });

    it('fuzzy-matches prefix rows like any other row', () => {
      expect(resolvedTo('papuaa')).toBe('PNG');
      expect(resolvedTo('equatorail')).toBe('GNQ');
    });
  });

  describe('distance and budget', () => {
    it('counts an adjacent transposition as one edit', () => {
      expect(resolvedTo('grmnay')).toBe('none');
      expect(resolvedTo('germnay')).toBe('DEU');
      expect(resolvedTo('frnace')).toBe('FRA');
    });

    it('does not charge for spaces', () => {
      expect(resolvedTo('guineabissau')).toBe('GNB');
      expect(resolvedTo('new zea land')).toBe('NZL');
      expect(resolvedTo('southkorea')).toBe('KOR');
    });

    it('requires names under four letters to be typed exactly', () => {
      expect(resolvedTo('peru')).toBe('PER');
      expect(resolvedTo('usb')).toBe('none');
      expect(resolvedTo('uk')).toBe('GBR');
      expect(resolvedTo('ik')).toBe('none');
      expect(resolvedTo('usa')).toBe('USA');
    });

    it('allows one edit for names of four to seven letters', () => {
      expect(resolvedTo('peeru')).toBe('PER');
      expect(resolvedTo('ptaru')).toBe('none');
    });

    it('allows two edits for names of eight letters or more', () => {
      expect(resolvedTo('germny')).toBe('DEU');
      expect(resolvedTo('germ')).toBe('none');
      expect(resolvedTo('kazakstan')).toBe('KAZ');
      expect(resolvedTo('kazaksta')).toBe('KAZ');
      expect(resolvedTo('kazaks')).toBe('none');
    });

    it('prefers the closer place over one that is merely in budget', () => {
      expect(resolvedTo('dominica')).toBe('DMA');
      expect(resolvedTo('niger')).toBe('NER');
      expect(resolvedTo('sudn')).toBe('SDN');
    });
  });

  describe('outcomes', () => {
    it('is correct when the nearest place is the target', () => {
      expect(matcher.judge('nigeria', 'NGA')).toEqual({ verdict: 'correct', placeId: 'NGA' });
      expect(matcher.judge('nigr', 'NER')).toEqual({ verdict: 'correct', placeId: 'NER' });
    });

    it('is wrong, naming the place, when the nearest place is another one', () => {
      expect(matcher.judge('niger', 'NGA')).toEqual({ verdict: 'wrong', placeId: 'NER' });
    });

    it('judges a place outside the round as wrong, whatever the target', () => {
      expect(matcher.judge('somaliland', 'SOM')).toEqual({ verdict: 'wrong', placeId: 'SOL' });
    });

    it('answers in German as well as English', () => {
      expect(matcher.judge('Elfenbeinküste', 'CIV').verdict).toBe('correct');
      expect(matcher.judge('Ivory Coast', 'CIV').verdict).toBe('correct');
    });

    it('is ambiguous on a tie, even if the target is among the tied places', () => {
      expect(matcher.judge('nigera', 'NGA')).toEqual({ verdict: 'ambiguous' });
      expect(matcher.judge('nigera', 'NER')).toEqual({ verdict: 'ambiguous' });
    });

    it('is no match when nothing is in budget, and for empty input', () => {
      expect(matcher.judge('xyzzy', 'NGA')).toEqual({ verdict: 'none' });
      expect(matcher.judge('   ', 'NGA')).toEqual({ verdict: 'none' });
      expect(matcher.judge('???', 'NGA')).toEqual({ verdict: 'none' });
    });
  });
});
