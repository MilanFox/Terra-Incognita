import { tiers } from './model.ts';
import type { CheckLine } from './check.ts';
import type { Tier } from './model.ts';
import type { Chains } from './steps/chains.ts';

const prototypeSovereignChains = ['MDV', 'SYC', 'TUV', 'MHL', 'KIR', 'FSM', 'PLW', 'TON', 'CPV', 'COM', 'SLB', 'VUT'];

const expectedChains: Record<Tier, string[]> = {
  sovereign: [...prototypeSovereignChains, 'BHS', 'ATG', 'MUS', 'STP'],
  defacto: [],
  dependencies: ['TCA', 'PCN', 'PYF', 'VIR', 'AIA', 'VGB', 'CYM', 'SHN', 'GGY', 'IOT', 'COK', 'WLF', 'SGS', 'ASM', 'MNP'],
};

const expectedGroups: Record<string, string[]> = { KIR: ['Gilbert', 'Line', 'Phoenix'], SHN: ['Tristan da Cunha'] };

const acceptedOverlaps = ['BHS-TCA', 'VGB-VIR'];

export const chainChecks = ({ outlines, idsByTier, staleRulings, overlaps }: Chains): CheckLine[] => [
  {
    label: `the ${prototypeSovereignChains.length} prototype sovereign island chains are chains`,
    failures: prototypeSovereignChains.filter(id => !idsByTier.sovereign.includes(id)).map(id => `${id} is missing`),
  },
  {
    label: `island chains per tier are ${tiers.map(tier => expectedChains[tier].length).join(' / ')}`,
    failures: tiers.flatMap(tier => [
      ...idsByTier[tier].filter(id => !expectedChains[tier].includes(id)).map(id => `${tier}: + ${id}`),
      ...expectedChains[tier].filter(id => !idsByTier[tier].includes(id)).map(id => `${tier}: − ${id}`),
    ]),
  },
  {
    label: 'Kiribati and St Helena are outlined in groups',
    failures: Object.entries(expectedGroups).flatMap(([id, expected]) => {
      const groups = outlines.filter(outline => outline.id === id).map(({ group }) => group ?? '(whole)').sort();
      return groups.join() === expected.join() ? [] : [`${id}: ${groups.join(', ') || 'none'}, expected ${expected.join(', ')}`];
    }),
  },
  {
    label: `island chain outlines overlap only in ${acceptedOverlaps.join(', ')}`,
    failures: overlaps.filter(pair => !acceptedOverlaps.includes(pair)).map(pair => `${pair} overlap`),
  },
  { label: 'island chain rulings in chains.json apply', failures: staleRulings },
];
