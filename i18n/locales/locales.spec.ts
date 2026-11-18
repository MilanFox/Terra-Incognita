import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';
import deSource from './de.json?raw';
import enSource from './en.json?raw';

const collectKeyPaths = (messages: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? collectKeyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`]);

describe('locale files', () => {
  it('define the same message keys in English and German', () => {
    expect(collectKeyPaths(de).sort()).toEqual(collectKeyPaths(en).sort());
  });

  it('point each place note at an About the map section, the same one in English and German', () => {
    const sectionsByPlace = (source: string) => Object.fromEntries(Object.entries<{ section: string }>(JSON.parse(source).about.notes).map(([placeId, note]) => [placeId, note.section]));
    expect(Object.keys(sectionsByPlace(enSource)).sort()).toEqual(['AFG', 'CUB', 'CYP', 'GBR', 'ISR', 'KAZ', 'MAR', 'PSX', 'RUS', 'SAH', 'UKR']);
    expect(sectionsByPlace(deSource)).toEqual(sectionsByPlace(enSource));
    for (const section of Object.values(sectionsByPlace(enSource))) expect(Object.keys(en.about.sections)).toContain(section);
  });
});
