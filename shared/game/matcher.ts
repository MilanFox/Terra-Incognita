import { normaliseInput, normaliseKeys } from '../utils/normalise';

interface LanguageNames {
  name: string
  aliases: string[]
}

export interface PlaceNames {
  en: LanguageNames
  de: LanguageNames
}

export type NamesFile = Record<string, PlaceNames | string>;

export type Resolution
  = | { outcome: 'match', placeId: string }
    | { outcome: 'ambiguous' }
    | { outcome: 'none' };

export type Verdict
  = | { verdict: 'correct', placeId: string }
    | { verdict: 'wrong', placeId: string }
    | { verdict: 'ambiguous' }
    | { verdict: 'none' };

interface KeyRow {
  placeId: string
  letters: string
  budget: number
}

const minimumPrefixLetters = 4;

const withoutSpaces = (key: string) => key.replaceAll(' ', '');

const editBudgetFor = (letterCount: number) => {
  if (letterCount < 4) return 0;
  return letterCount <= 7 ? 1 : 2;
};

/** Optimal string alignment: an adjacent transposition costs one edit. */
const editDistance = (typed: string, target: string) => {
  const rows = Array.from({ length: typed.length + 1 }, (_, row) => {
    const cells = new Array<number>(target.length + 1).fill(0);
    cells[0] = row;
    return cells;
  });
  for (let column = 0; column <= target.length; column++) rows[0]![column] = column;
  for (let row = 1; row <= typed.length; row++) {
    for (let column = 1; column <= target.length; column++) {
      let best = Math.min(
        rows[row - 1]![column]! + 1,
        rows[row]![column - 1]! + 1,
        rows[row - 1]![column - 1]! + (typed[row - 1] === target[column - 1] ? 0 : 1),
      );
      if (row > 1 && column > 1 && typed[row - 1] === target[column - 2] && typed[row - 2] === target[column - 1]) {
        best = Math.min(best, rows[row - 2]![column - 2]! + 1);
      }
      rows[row]![column] = best;
    }
  }
  return rows[typed.length]![target.length]!;
};

const fullKeysOf = (names: PlaceNames) => [names.en, names.de]
  .flatMap(language => [language.name, ...language.aliases])
  .flatMap(normaliseKeys)
  .filter(Boolean);

const wholeTokenPrefixesOf = (key: string) => {
  const tokens = key.split(' ');
  return tokens
    .slice(1)
    .map((_, index) => tokens.slice(0, index + 1))
    .filter(prefixTokens => prefixTokens.at(-1) !== '&')
    .map(prefixTokens => prefixTokens.join(' '));
};

const buildRows = (names: NamesFile) => {
  const fullKeysByPlace = new Map<string, Set<string>>();
  for (const [placeId, entry] of Object.entries(names)) {
    if (typeof entry !== 'string') fullKeysByPlace.set(placeId, new Set(fullKeysOf(entry)));
  }
  const everyFullKey = new Set([...fullKeysByPlace.values()].flatMap(keys => [...keys].map(withoutSpaces)));

  const rows: KeyRow[] = [];
  for (const [placeId, fullKeys] of fullKeysByPlace) {
    const prefixes = [...fullKeys]
      .flatMap(wholeTokenPrefixesOf)
      .filter(prefix => withoutSpaces(prefix).length >= minimumPrefixLetters && !everyFullKey.has(withoutSpaces(prefix)));
    for (const letters of new Set([...fullKeys, ...prefixes].map(withoutSpaces))) {
      rows.push({ placeId, letters, budget: editBudgetFor(letters.length) });
    }
  }
  return rows;
};

export const createMatcher = (names: NamesFile) => {
  const rows = buildRows(names);

  const resolve = (typedText: string): Resolution => {
    const typed = withoutSpaces(normaliseInput(typedText));
    if (!typed) return { outcome: 'none' };

    const nearestDistanceByPlace = new Map<string, number>();
    for (const row of rows) {
      if (Math.abs(typed.length - row.letters.length) > row.budget) continue;
      const distance = editDistance(typed, row.letters);
      if (distance > row.budget) continue;
      const known = nearestDistanceByPlace.get(row.placeId);
      if (known === undefined || distance < known) nearestDistanceByPlace.set(row.placeId, distance);
    }
    if (nearestDistanceByPlace.size === 0) return { outcome: 'none' };

    const nearestDistance = Math.min(...nearestDistanceByPlace.values());
    const nearestPlaceIds = [...nearestDistanceByPlace]
      .filter(([, distance]) => distance === nearestDistance)
      .map(([placeId]) => placeId);
    const [placeId] = nearestPlaceIds;
    return nearestPlaceIds.length === 1 && placeId ? { outcome: 'match', placeId } : { outcome: 'ambiguous' };
  };

  const judge = (typedText: string, targetPlaceId: string): Verdict => {
    const resolution = resolve(typedText);
    if (resolution.outcome !== 'match') return { verdict: resolution.outcome };
    return { verdict: resolution.placeId === targetPlaceId ? 'correct' : 'wrong', placeId: resolution.placeId };
  };

  return { resolve, judge };
};

export type Matcher = ReturnType<typeof createMatcher>;
