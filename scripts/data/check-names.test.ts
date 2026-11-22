// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkNames } from './check-names.ts';
import type { AliasRulings, Names } from './steps/names.ts';

const names: Names = {
  COD: { en: { name: 'DR Congo', aliases: [] }, de: { name: 'DR Kongo', aliases: [] }, capitals: {} },
};

const failuresOf = (aliasRulings: AliasRulings) =>
  checkNames({ names, placeIds: ['COD'], unusedDrops: [], aliasRulings }).lines.flatMap(({ failures }) => failures);

describe('checkNames', () => {
  it('passes display-name overrides for a place in EN and DE', () => {
    expect(failuresOf({ COD: { name: { en: 'DR Congo', de: 'DR Kongo' } } })).toEqual([]);
  });

  it('fails on a display-name override for an id that is not a place', () => {
    expect(failuresOf({ ZAR: { name: { en: 'Zaire' } } })).toEqual(['ZAR: unknown id']);
  });

  it('fails on a display-name override in a language other than EN or DE', () => {
    const aliasRulings = JSON.parse('{ "COD": { "name": { "en": "DR Congo", "fr": "RD Congo" } } }') as AliasRulings;

    expect(failuresOf(aliasRulings)).toEqual(['COD fr: unknown language']);
  });
});
