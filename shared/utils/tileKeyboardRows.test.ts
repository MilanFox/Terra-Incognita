import { describe, expect, it } from 'vitest';
import { letterRowsFor } from './tileKeyboardRows';

describe('tile keyboard rows', () => {
  it('keeps the English layout without umlauts', () => {
    expect(letterRowsFor('en')).toEqual(['qwertyuiop', 'asdfghjkl', 'zxcvbnm']);
  });

  it('puts ü, ö and ä on the German layout', () => {
    expect(letterRowsFor('de')).toEqual(['qwertzuiopü', 'asdfghjklöä', 'yxcvbnm']);
  });

  it('falls back to English for unknown locales', () => {
    expect(letterRowsFor('fr')).toEqual(letterRowsFor('en'));
  });

  it('types the lowercase umlaut for a German key', () => {
    expect([...letterRowsFor('de')[0]].at(-1)).toBe('ü');
  });
});
