import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';

const collectKeyPaths = (messages: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? collectKeyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`]);

describe('locale files', () => {
  it('define the same message keys in English and German', () => {
    expect(collectKeyPaths(de).sort()).toEqual(collectKeyPaths(en).sort());
  });
});
