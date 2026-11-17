const umlautExpansions: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue' };

const tokenEquivalences: Record<string, string> = {
  saint: 'st',
  sankt: 'st',
  and: '&',
  und: '&',
};

const withoutUmlauts = (text: string) => text.replace(/[äöü]/g, umlaut => umlaut.normalize('NFD')[0] ?? umlaut);

const withExpandedUmlauts = (text: string) => text.replace(/[äöü]/g, umlaut => umlautExpansions[umlaut] ?? umlaut);

const keyOf = (lowered: string) => lowered
  .replace(/[øæœłđðþ]/g, letter => ({ ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ð: 'd', þ: 'th' })[letter] ?? letter)
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .replaceAll('&', ' & ')
  .replace(/[^a-z0-9&]+/g, ' ')
  .split(' ')
  .filter(Boolean)
  .map(token => tokenEquivalences[token] ?? token)
  .filter(token => token !== 'the')
  .join(' ');

const lowercased = (text: string) => text.toLowerCase().replaceAll('ß', 'ss');

export const normaliseInput = (text: string) => keyOf(withoutUmlauts(lowercased(text)));

/** Keys of a table row: umlauts dropped and expanded (ö becomes o and oe), so both spellings hit. */
export const normaliseKeys = (text: string) => {
  const lowered = lowercased(text);
  return [...new Set([withoutUmlauts(lowered), withExpandedUmlauts(lowered)].map(keyOf))];
};
