import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tiers } from './model.ts';
import { curatedDir, fromRepoRoot } from './paths.ts';
import { pairKey } from './steps/mainland.ts';
import type { CheckLine } from './check.ts';
import type { Tier } from './model.ts';
import type { DroppedBorder, NotMainland, TierMainlands } from './steps/mainland.ts';
import type { Names } from './steps/names.ts';

type ReviewedList = { review: string, pairs: Record<string, string> };
export type DroppedBorderNotes = Record<Tier, Map<string, string>>;

const reviewedListPath = (tier: Tier) => resolve(curatedDir, `dropped-borders.${tier}.json`);

const readReviewedList = (tier: Tier): ReviewedList | undefined => {
  const path = reviewedListPath(tier);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
};

const englishNames = (placeNames: Names) => new Map(Object.entries(placeNames).map(([id, { en }]) => [id, en.name]));

const noteOf = ({ ids, reasons }: DroppedBorder, names: Map<string, string>) => {
  const nameOf = (id: string) => names.get(id) ?? id;
  const isIsland = ({ kind }: NotMainland) => kind === 'island landmass';
  const mergedLand = ({ place, land }: NotMainland) => (land === place ? '' : ` (${nameOf(land)})`);
  const mergedIslandLands = reasons.filter(reason => isIsland(reason) && reason.land !== reason.place).map(({ land }) => nameOf(land));
  const parts = [
    ...(reasons.some(isIsland) ? [`island landmass${mergedIslandLands.length ? ` (${mergedIslandLands.join(', ')})` : ''}`] : []),
    ...reasons.filter(reason => !isIsland(reason)).map(reason => `${reason.kind} of ${nameOf(reason.place)}${mergedLand(reason)}`),
  ];
  return `${ids.map(nameOf).join(' – ')}: ${[...new Set(parts)].join('; ') || 'no reason found'}`;
};

export const droppedBorderNotes = (mainlands: Record<Tier, TierMainlands>, placeNames: Names) => {
  const names = englishNames(placeNames);
  return Object.fromEntries(tiers.map(tier => [
    tier,
    new Map(mainlands[tier].dropped.map(border => [pairKey(...border.ids), noteOf(border, names)])),
  ])) as DroppedBorderNotes;
};

export const printDroppedBorders = (mainlands: Record<Tier, TierMainlands>, notes: DroppedBorderNotes) => {
  for (const tier of tiers) {
    const { neighbours, placesByBlock } = mainlands[tier];
    const pairCount = [...neighbours.values()].flat().length / 2;
    const blocks = Object.entries(placesByBlock).map(([block, count]) => `${block} ${count}`).join(', ');
    console.log(`  ${tier}: ${pairCount} mainland pairs, ${notes[tier].size} dropped; mainlands on ${blocks}`);
    for (const [pair, note] of notes[tier]) console.log(`    ${pair}  ${note}`);
  }
};

// The review status only drives the warning: the pairs are compared whether a list is reviewed or not.
export const droppedBordersMatch = (notes: DroppedBorderNotes): { line: CheckLine, warnings: string[] } => {
  const reviewed = Object.fromEntries(tiers.map(tier => [tier, readReviewedList(tier)])) as Record<Tier, ReviewedList | undefined>;
  const failures = tiers.flatMap((tier) => {
    const pairs = reviewed[tier]?.pairs ?? {};
    return [
      ...(reviewed[tier] ? [] : [`${tier}: ${fromRepoRoot(reviewedListPath(tier))} is missing`]),
      ...[...notes[tier]].filter(([pair]) => !Object.hasOwn(pairs, pair)).map(([pair, note]) => `${tier}: + ${pair}  ${note}`),
      ...Object.entries(pairs).filter(([pair]) => !notes[tier].has(pair)).map(([pair, note]) => `${tier}: - ${pair}  ${note}`),
    ];
  });
  const pending = tiers.filter(tier => reviewed[tier]?.review !== 'accepted');
  return {
    line: {
      label: `dropped-border lists match data/curated/dropped-borders.<tier>.json (${tiers.map(tier => notes[tier].size).join(' / ')} pairs)`,
      failures,
    },
    warnings: pending.length ? [`dropped-border lists pending the owner's review: ${pending.join(', ')}`] : [],
  };
};
