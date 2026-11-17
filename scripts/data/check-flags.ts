import { hasViewBox, maxShippedBytes } from './steps/flags.ts';
import type { CheckLine } from './check.ts';
import type { FlagJoin, FlagSources } from './steps/flags.ts';

export type FlagsCheck = { lines: CheckLine[], warnings: string[] };

const creditKey = ({ file, artist, license, licenseUrl }: FlagJoin['credits'][number]) => JSON.stringify([file, artist, license, licenseUrl]);

const creditWarnings = ({ credits }: FlagJoin, { previousCredits }: FlagSources) => {
  if (!previousCredits) return [];
  const previous = new Map(previousCredits.map(credit => [credit.id, credit]));
  return credits.flatMap((credit) => {
    const before = previous.get(credit.id);
    if (!before) return [`a new attribution-required flag: ${credit.id} (${credit.file}, ${credit.license})`];
    return creditKey(before) === creditKey(credit) ? [] : [`the licence of ${credit.id} changed: ${before.license} -> ${credit.license}`];
  });
};

export const checkFlags = (flagJoin: FlagJoin, sources: FlagSources): FlagsCheck => {
  const { flags, svgs, failures } = flagJoin;
  const flagCount = Object.keys(svgs).length;
  return {
    lines: [
      {
        label: `every place has a flag SVG or is flagless (${flagCount} flags, ${Object.keys(flags).length - flagCount} flagless)`,
        failures: [...failures.resolution, ...failures.missingFiles, ...failures.mismatches],
      },
      {
        label: 'every flag SVG has a viewBox',
        failures: Object.entries(svgs).filter(([, svg]) => !hasViewBox(svg)).map(([id]) => id),
      },
      {
        label: 'every flag SVG is under 2 MiB',
        failures: Object.entries(svgs).filter(([, svg]) => Buffer.byteLength(svg) >= maxShippedBytes).map(([id]) => id),
      },
    ],
    warnings: creditWarnings(flagJoin, sources),
  };
};
