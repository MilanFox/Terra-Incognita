import { tiers } from './model.ts';
import type { CheckLine } from './check.ts';
import type { Tier } from './model.ts';
import type { ChainOutline, Chains } from './steps/chains.ts';

const prototypeSovereignChains = ['MDV', 'SYC', 'TUV', 'MHL', 'KIR', 'FSM', 'PLW', 'TON', 'CPV', 'COM', 'SLB', 'VUT'];

export const expectedChains: Record<Tier, string[]> = {
  sovereign: [...prototypeSovereignChains, 'BHS', 'ATG', 'MUS', 'STP'],
  defacto: [],
  dependencies: ['TCA', 'PCN', 'PYF', 'VIR', 'AIA', 'VGB', 'CYM', 'SHN', 'GGY', 'IOT', 'COK', 'WLF', 'SGS', 'ASM', 'MNP'],
};

export const acceptedOverlaps = ['BHS-TCA', 'VGB-VIR'];
const maxOutlineWidthDegrees = 180;

const widthOf = ({ ring }: ChainOutline) => {
  const longitudes = ring.map(([longitude]) => longitude);
  return Math.max(...longitudes) - Math.min(...longitudes);
};

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
    label: 'every island chain has one outline',
    failures: tiers.flatMap(tier => idsByTier[tier]).flatMap((id) => {
      const count = outlines.filter(outline => outline.id === id).length;
      return count === 1 ? [] : [`${id} has ${count} outlines`];
    }),
  },
  {
    label: `no island chain outline is wider than ${maxOutlineWidthDegrees}°`,
    failures: outlines.filter(outline => widthOf(outline) > maxOutlineWidthDegrees).map(outline => `${outline.id} is ${Math.round(widthOf(outline))}° wide`),
  },
  {
    label: `island chain outlines overlap only in ${acceptedOverlaps.join(', ')}`,
    failures: [
      ...overlaps.filter(pair => !acceptedOverlaps.includes(pair)).map(pair => `${pair} overlap`),
      ...acceptedOverlaps.filter(pair => !overlaps.includes(pair)).map(pair => `${pair} no longer overlap; remove the exception`),
    ],
  },
  { label: 'island chain rulings in chains.json apply', failures: staleRulings },
];
