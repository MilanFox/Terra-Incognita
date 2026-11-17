import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { curatedDir, fromRepoRoot } from './paths.ts';
import { pairKey } from './steps/mainland.ts';
import type { CheckLine } from './check.ts';
import type { DroppedBorder, NotMainland, TierMainlands } from './steps/mainland.ts';
import type { Names } from './steps/names.ts';

type ReviewedList = { review: string, pairs: Record<string, string> };
export type DroppedBorderNotes = Map<string, string>;

const reviewedListPath = resolve(curatedDir, 'dropped-borders.sovereign.json');

const readReviewedList = (): ReviewedList | undefined =>
  (existsSync(reviewedListPath) ? JSON.parse(readFileSync(reviewedListPath, 'utf8')) : undefined);

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

export const droppedBorderNotes = (mainlands: TierMainlands, placeNames: Names): DroppedBorderNotes => {
  const names = englishNames(placeNames);
  return new Map(mainlands.dropped.map(border => [pairKey(...border.ids), noteOf(border, names)]));
};

export const printDroppedBorders = ({ neighbours, placesByBlock }: TierMainlands, notes: DroppedBorderNotes) => {
  const pairCount = [...neighbours.values()].flat().length / 2;
  const blocks = Object.entries(placesByBlock).map(([block, count]) => `${block} ${count}`).join(', ');
  console.log(`  sovereign: ${pairCount} mainland pairs, ${notes.size} dropped; mainlands on ${blocks}`);
  for (const [pair, note] of notes) console.log(`    ${pair}  ${note}`);
};

// The review status only drives the warning: the pairs are compared whether the list is reviewed or not.
export const droppedBordersMatch = (notes: DroppedBorderNotes): { line: CheckLine, warnings: string[] } => {
  const reviewed = readReviewedList();
  const pairs = reviewed?.pairs ?? {};
  const failures = [
    ...(reviewed ? [] : [`${fromRepoRoot(reviewedListPath)} is missing`]),
    ...[...notes].filter(([pair]) => !Object.hasOwn(pairs, pair)).map(([pair, note]) => `+ ${pair}  ${note}`),
    ...Object.entries(pairs).filter(([pair]) => !notes.has(pair)).map(([pair, note]) => `- ${pair}  ${note}`),
  ];
  return {
    line: {
      label: `dropped-border list matches data/curated/dropped-borders.sovereign.json (${notes.size} pairs)`,
      failures,
    },
    warnings: reviewed?.review === 'accepted' ? [] : [`the sovereign dropped-border list is pending the owner's review`],
  };
};
