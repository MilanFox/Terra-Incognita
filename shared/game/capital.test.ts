import { describe, expect, it } from 'vitest';
import shippedNames from '../../public/data/names.json';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame } from './game';
import type { KeyValueStorage, Place, RoundSetup, Tier } from './game';
import { createCapitalMatcher } from './matcher';
import type { NamesFile } from './matcher';

const places = shippedPlaces as Place[];
const names = shippedNames as NamesFile;
const capitalMatcher = createCapitalMatcher(names, places);

const resolvedTo = (typed: string) => {
  const resolution = capitalMatcher.resolve(typed);
  return resolution.outcome === 'match' ? resolution.placeIds.join('/') : resolution.outcome;
};

const memoryStorage = (): KeyValueStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
};

const capitalTraps: Record<string, [typed: string, expected: string][]> = {
  'Pair scan finds (real data)': [
    ['rome', 'ITA'],
    ['lome', 'TGO'],
    ['lomé', 'TGO'],
    ['ome', 'ambiguous'],
    ['manama', 'BHR'],
    ['panama', 'PAN'],
    ['anama', 'ambiguous'],
    ['budapest', 'HUN'],
    ['bukarest', 'ROU'],
    ['budarest', 'ambiguous'],
  ],
  'Kingston / Kingstown': [
    ['kingston', 'ambiguous'],
    ['kingstown', 'VCT'],
    ['kingstwn', 'ambiguous'],
    ['kingstn', 'ambiguous'],
    ['kingstone', 'ambiguous'],
    ['kingtown', 'VCT'],
  ],
  'Saint capitals': [
    ['st johns', 'ATG'],
    ['st john\'s', 'ATG'],
    ['saint john\'s', 'ATG'],
    ['st john', 'ATG'],
    ['st georges', 'GRD'],
    ['st. george\'s', 'GRD'],
    ['st george', 'GRD'],
    ['st goerge\'s', 'GRD'],
    ['st helier', 'JEY'],
    ['saint helier', 'JEY'],
    ['st peter port', 'GGY'],
    ['saint peter port', 'GGY'],
    ['sankt peter port', 'GGY'],
    ['st', 'none'],
  ],
  'Nicosia / North Nicosia': [
    ['nicosia', 'CYP'],
    ['nikosia', 'CYP'],
    ['nicosa', 'CYP'],
    ['north nicosia', 'CYN'],
    ['nord nikosia', 'CYN'],
    ['lefkosa', 'CYN'],
    ['lefkoşa', 'CYN'],
  ],
  'Several capitals': [
    ['la paz', 'BOL'],
    ['lapaz', 'BOL'],
    ['sucre', 'BOL'],
    ['amsterdam', 'NLD'],
    ['den haag', 'none'],
    ['the hague', 'none'],
    ['hague', 'none'],
    ['pretoria', 'ZAF'],
    ['cape town', 'ZAF'],
    ['kapstadt', 'ZAF'],
    ['bloemfontein', 'ZAF'],
  ],
  'German capital names': [
    ['prag', 'CZE'],
    ['prague', 'CZE'],
    ['kopenhagen', 'DNK'],
    ['taipeh', 'TWN'],
    ['taipei', 'TWN'],
    ['wien', 'AUT'],
    ['pjöngjang', 'PRK'],
    ['pjoengjang', 'PRK'],
    ['khartum', 'SDN'],
    ['bagdad', 'IRQ'],
    ['teheran', 'IRN'],
  ],
  'Lookalike neighbours': [
    ['niamey', 'NER'],
    ['abuja', 'NGA'],
    ['kinshasa', 'COD'],
    ['brazzaville', 'COG'],
    ['bissau', 'GNB'],
    ['conakry', 'GIN'],
  ],
};

const startCapitalRound = (changes: Partial<RoundSetup> = {}) => {
  const game = createGame({ places, names, version: shippedVersion, random: () => 0.5, clock: () => Date.UTC(2026, 10, 17), storage: memoryStorage() });
  game.send({ type: 'start', setup: { ...game.setupFor('capital'), deckSize: 'all', ...changes } });
  return game;
};

const promptedPlaceId = (game: ReturnType<typeof startCapitalRound>) => {
  if (game.state.phase !== 'prompt') throw new Error(`Expected a prompt, got ${game.state.phase}`);
  return game.state.placeId;
};

const startCapitalRoundAt = (targetPlaceId: string, tier: Tier = 'sovereign') => {
  const game = startCapitalRound({ tier });
  while (promptedPlaceId(game) !== targetPlaceId) {
    game.send({ type: 'dontKnow' });
    game.send({ type: 'next' });
  }
  return game;
};

const answerAt = (targetPlaceId: string, typed: string, tier: Tier = 'sovereign') => {
  const game = startCapitalRoundAt(targetPlaceId, tier);
  game.send({ type: 'submit', text: typed });
  return game.state;
};

describe('Name the capital setup', () => {
  it('has one variant and the first-time defaults', () => {
    const game = startCapitalRound();
    const setup = game.setupFor('capital');
    expect(setup).toMatchObject({ mode: 'capital', variant: 'map', region: 'world', tier: 'sovereign', easy: false, timed: false });
    expect(game.choicesFor(setup).variants).toHaveLength(1);
  });
});

describe('Name the capital pools', () => {
  it('leaves out every place without a capital in every tier', () => {
    const capitalless = places.filter(({ capitals }) => capitals?.length === 0).map(({ id }) => id);
    expect(capitalless).toHaveLength(6);
    const game = startCapitalRound();
    for (const tier of ['sovereign', 'defacto', 'dependencies'] as Tier[]) {
      const pool = game.poolOf({ ...game.setupFor('capital'), tier });
      expect(pool.length).toBeGreaterThan(0);
      expect(pool.filter(placeId => capitalless.includes(placeId))).toEqual([]);
    }
  });

  it('keeps those places in the pools of other modes', () => {
    const game = startCapitalRound();
    expect(game.poolOf({ ...game.setupFor('name'), tier: 'dependencies' })).toContain('HKG');
  });
});

describe('Name the capital answers', () => {
  it('accepts the capital of the target', () => {
    expect(answerAt('DEU', 'Berlin')).toMatchObject({ phase: 'verdict', answer: { outcome: 'right', placeId: 'DEU' } });
  });

  it('accepts the capital in German, with a small typo', () => {
    expect(answerAt('AUT', 'Wien')).toMatchObject({ answer: { outcome: 'right' } });
    expect(answerAt('DEU', 'Berlni')).toMatchObject({ answer: { outcome: 'right' } });
  });

  it('accepts any listed capital of the target', () => {
    for (const capital of ['Pretoria', 'Cape Town', 'Bloemfontein']) {
      expect(answerAt('ZAF', capital), capital).toMatchObject({ answer: { outcome: 'right', placeId: 'ZAF' } });
    }
  });

  it('marks the capital of another place wrong and names that place', () => {
    expect(answerAt('DEU', 'Paris')).toMatchObject({ answer: { outcome: 'wrong', placeId: 'DEU', tappedPlaceId: 'FRA' } });
  });

  it('matches capitals only: a place name scores nothing', () => {
    expect(answerAt('FRA', 'Germany')).toMatchObject({ phase: 'prompt', unresolvedAnswers: ['none'] });
  });

  it('scores nothing for an answer that fits two capitals', () => {
    expect(answerAt('DEU', 'ome')).toMatchObject({ phase: 'prompt', unresolvedAnswers: ['ambiguous'] });
  });

  it('counts a capital name shared by two places as right for either', () => {
    expect(answerAt('JAM', 'Kingston', 'dependencies')).toMatchObject({ answer: { outcome: 'right', placeId: 'JAM' } });
    expect(answerAt('NFK', 'Kingston', 'dependencies')).toMatchObject({ answer: { outcome: 'right', placeId: 'NFK' } });
  });

  it('keeps a shared capital name ambiguous for a third place', () => {
    expect(answerAt('DEU', 'Kingston', 'dependencies')).toMatchObject({ phase: 'prompt', unresolvedAnswers: ['ambiguous'] });
  });

  it('does not count The Hague as a capital of the Netherlands', () => {
    expect(answerAt('NLD', 'Den Haag')).toMatchObject({ phase: 'prompt', unresolvedAnswers: ['none'] });
  });
});

describe('capital traps from the answer-matching prototype', () => {
  it('has all 65', () => {
    expect(Object.values(capitalTraps).flat()).toHaveLength(65);
  });

  for (const [group, traps] of Object.entries(capitalTraps)) {
    it(group, () => {
      for (const [typed, expected] of traps) {
        expect(resolvedTo(typed), typed).toBe(expected);
      }
    });
  }
});
