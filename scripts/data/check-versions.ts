import { tiers } from './model.ts';
import { mapText } from './steps/write.ts';
import type { CheckLine } from './check.ts';
import type { TierMaps } from './steps/dissolve.ts';
import type { IdChanges, PreviousOutput } from './steps/version.ts';

// A lost id means a changed output, so the build would bump to the next version.
export const idChecks = (previous: PreviousOutput, ids: string[], { idMoves, removed }: IdChanges): CheckLine[] => {
  const nextVersion = String((previous.version?.dataVersion ?? 0) + 1);
  const moves = idMoves[nextVersion] ?? {};
  const removedIds = removed[nextVersion] ?? [];
  const present = new Set(ids);
  return [
    {
      label: `every previous id is present, moved or removed (version ${nextVersion})`,
      failures: previous.placeIds
        .filter(id => !present.has(id) && !(id in moves) && !removedIds.includes(id))
        .map(id => `${id} is gone and in neither idMoves nor removed for version ${nextVersion}`),
    },
    {
      label: 'every idMoves target exists',
      failures: Object.entries(moves)
        .filter(([, target]) => !present.has(target))
        .map(([id, target]) => `${id} moves to ${target}, which does not exist`),
    },
  ];
};

export const geometryChanged = (previous: PreviousOutput, maps: TierMaps) => {
  const changed = tiers.filter((tier) => {
    const before = previous.files.get(`map-${tier}.geojson`);
    return before !== undefined && before !== mapText(maps[tier]);
  });
  return changed.length ? [`geometry changed since the last version: ${changed.join(', ')}`] : [];
};
