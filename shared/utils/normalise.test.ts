import { describe, expect, it } from 'vitest';
import { normaliseInput, normaliseKeys } from './normalise';

describe('normaliseInput', () => {
  it('lowercases, folds ß and drops umlauts and marks', () => {
    expect(normaliseInput('Weißrussland')).toBe('weissrussland');
    expect(normaliseInput('Österreich')).toBe('osterreich');
    expect(normaliseInput('Côte d’Ivoire')).toBe('cote d ivoire');
  });

  it('maps letters NFD cannot decompose', () => {
    expect(normaliseInput('Færøerne Łódź Đorđe Þór')).toBe('faeroerne lodz dorde thor');
  });

  it('treats & as a token and equates and, und and &', () => {
    expect(normaliseInput('Trinidad&Tobago')).toBe('trinidad & tobago');
    expect(normaliseInput('St. Kitts und Nevis')).toBe('st kitts & nevis');
    expect(normaliseInput('Saint Kitts and Nevis')).toBe('st kitts & nevis');
    expect(normaliseInput('Sankt Kitts')).toBe('st kitts');
  });

  it('drops the token the but keeps longer words', () => {
    expect(normaliseInput('The Gambia')).toBe('gambia');
    expect(normaliseInput('Theland')).toBe('theland');
  });

  it('collapses runs of other characters into one space', () => {
    expect(normaliseInput('  Guinea--Bissau  ')).toBe('guinea bissau');
  });
});

describe('normaliseKeys', () => {
  it('stores umlauts dropped and expanded', () => {
    expect(normaliseKeys('Südafrika')).toEqual(['sudafrika', 'suedafrika']);
  });

  it('returns one key when there is no umlaut', () => {
    expect(normaliseKeys('Österreich')).toEqual(['osterreich', 'oesterreich']);
    expect(normaliseKeys('Chad')).toEqual(['chad']);
  });
});
