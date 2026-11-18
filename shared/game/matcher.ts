import { normaliseInput, normaliseKeys } from '../utils/normalise';

interface LanguageNames {
  name: string
  aliases: string[]
}

export interface CapitalNames {
  en: LanguageNames
  de: LanguageNames
}

export interface PlaceNames extends CapitalNames {
  capitals?: Record<string, CapitalNames>
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
  entityId: string
  letters: string
  budget: number
  isPrefix: boolean
}

export interface CapitalOwner {
  id: string
  capitals?: readonly string[]
}

export type CapitalResolution
  = | { outcome: 'match', placeIds: string[] }
    | { outcome: 'ambiguous' }
    | { outcome: 'none' };

interface ResolvedEntity {
  entityId: string
  letters: string
  isPrefix: boolean
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

const fullKeysOf = (names: CapitalNames) => [names.en, names.de]
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

const buildRows = (fullKeysByEntity: Map<string, Set<string>>) => {
  const everyFullKey = new Set([...fullKeysByEntity.values()].flatMap(keys => [...keys].map(withoutSpaces)));

  const rows: KeyRow[] = [];
  for (const [entityId, fullKeys] of fullKeysByEntity) {
    const prefixes = [...fullKeys]
      .flatMap(wholeTokenPrefixesOf)
      .map(withoutSpaces)
      .filter(letters => letters.length >= minimumPrefixLetters && !everyFullKey.has(letters));
    const fullLetters = new Set([...fullKeys].map(withoutSpaces));
    for (const letters of new Set([...fullLetters, ...prefixes])) {
      rows.push({ entityId, letters, budget: editBudgetFor(letters.length), isPrefix: !fullLetters.has(letters) });
    }
  }
  return rows;
};

const createNearestResolver = (fullKeysByEntity: Map<string, Set<string>>) => {
  const rows = buildRows(fullKeysByEntity);

  return (typedText: string): ResolvedEntity[] => {
    const typed = withoutSpaces(normaliseInput(typedText));
    if (!typed) return [];

    const nearestByEntity = new Map<string, ResolvedEntity & { distance: number }>();
    for (const row of rows) {
      if (Math.abs(typed.length - row.letters.length) > row.budget) continue;
      const distance = editDistance(typed, row.letters);
      if (distance > row.budget) continue;
      const known = nearestByEntity.get(row.entityId);
      if (known === undefined || distance < known.distance) nearestByEntity.set(row.entityId, { entityId: row.entityId, letters: row.letters, isPrefix: row.isPrefix, distance });
    }
    const nearestDistance = Math.min(...[...nearestByEntity.values()].map(({ distance }) => distance));
    return [...nearestByEntity.values()].filter(({ distance }) => distance === nearestDistance);
  };
};

export const createMatcher = (names: NamesFile) => {
  const fullKeysByPlace = new Map<string, Set<string>>();
  for (const [placeId, entry] of Object.entries(names)) {
    if (typeof entry !== 'string') fullKeysByPlace.set(placeId, new Set(fullKeysOf(entry)));
  }
  const nearest = createNearestResolver(fullKeysByPlace);

  const resolve = (typedText: string): Resolution => {
    const nearestEntities = nearest(typedText);
    const [first] = nearestEntities;
    if (!first) return { outcome: 'none' };
    return nearestEntities.length === 1 ? { outcome: 'match', placeId: first.entityId } : { outcome: 'ambiguous' };
  };

  const judge = (typedText: string, targetPlaceId: string): Verdict => {
    const resolution = resolve(typedText);
    if (resolution.outcome !== 'match') return { verdict: resolution.outcome };
    return { verdict: resolution.placeId === targetPlaceId ? 'correct' : 'wrong', placeId: resolution.placeId };
  };

  return { resolve, judge };
};

export type Matcher = ReturnType<typeof createMatcher>;

export const createCapitalMatcher = (names: NamesFile, owners: readonly CapitalOwner[]) => {
  const ownersByCapital = new Map<string, string[]>();
  for (const { id, capitals = [] } of owners) {
    for (const capitalId of capitals) ownersByCapital.set(capitalId, [...(ownersByCapital.get(capitalId) ?? []), id]);
  }
  const fullKeysByCapital = new Map<string, Set<string>>();
  for (const { id, capitals = [] } of owners) {
    const placeNames = names[id];
    if (typeof placeNames === 'string' || !placeNames) continue;
    for (const capitalId of capitals) {
      const capitalNames = placeNames.capitals?.[capitalId];
      if (capitalNames) fullKeysByCapital.set(capitalId, new Set(fullKeysOf(capitalNames)));
    }
  }
  const nearest = createNearestResolver(fullKeysByCapital);

  const ownersOf = (entities: ResolvedEntity[]) => [...new Set(entities.flatMap(({ entityId }) => ownersByCapital.get(entityId) ?? []))];

  const isHomonymTie = (entities: ResolvedEntity[]) => entities.every(({ letters, isPrefix }) => !isPrefix && letters === entities[0]!.letters);

  const resolve = (typedText: string): CapitalResolution => {
    const nearestEntities = nearest(typedText);
    if (nearestEntities.length === 0) return { outcome: 'none' };
    return nearestEntities.length === 1 ? { outcome: 'match', placeIds: ownersOf(nearestEntities) } : { outcome: 'ambiguous' };
  };

  const judge = (typedText: string, targetPlaceId: string): Verdict => {
    const nearestEntities = nearest(typedText);
    if (nearestEntities.length === 0) return { verdict: 'none' };
    const placeIds = ownersOf(nearestEntities);
    if (nearestEntities.length > 1 && !(isHomonymTie(nearestEntities) && placeIds.includes(targetPlaceId))) return { verdict: 'ambiguous' };
    if (placeIds.includes(targetPlaceId)) return { verdict: 'correct', placeId: targetPlaceId };
    return { verdict: 'wrong', placeId: placeIds[0]! };
  };

  return { resolve, judge };
};

export type CapitalMatcher = ReturnType<typeof createCapitalMatcher>;
