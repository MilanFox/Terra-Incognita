import { tiers } from './model.ts';
import type { CheckLine } from './check.ts';
import type { Tier } from './model.ts';
import type { TierFacts } from './steps/tier-facts.ts';

export const neighboursAreSymmetric = (facts: Map<string, TierFacts>): CheckLine => {
  const pairCount = (tier: Tier) => new Set([...facts].flatMap(([id, { neighbours }]) =>
    neighbours[tier].map(other => [id, other].sort().join()))).size;
  return {
    label: `neighbours are symmetric in every tier (${tiers.map(pairCount).join(' / ')} pairs)`,
    failures: tiers.flatMap(tier => [...facts].flatMap(([id, { neighbours }]) => neighbours[tier]
      .filter(other => !facts.get(other)?.neighbours[tier].includes(id))
      .map(other => `${tier}: ${id} lists ${other}, but ${other} doesn't list ${id}`))),
  };
};
