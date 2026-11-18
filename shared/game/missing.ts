export const gapCount = 10;
export const missingTimeLimitMs = 90_000;
const tapBudget = 10;
const easyTapBudget = 30;

export type MissingTap
  = | { kind: 'sea' }
    | { kind: 'hit', placeId: string }
    | { kind: 'wrong', placeId: string };

export const tapBudgetOf = (easy: boolean) => (easy ? easyTapBudget : tapBudget);

export const drawGaps = (candidatePlaceIds: readonly string[], random: () => number) => {
  const remaining = [...candidatePlaceIds];
  return Array.from({ length: Math.min(gapCount, remaining.length) }, () => remaining.splice(Math.floor(random() * remaining.length), 1)[0]!);
};

// A gap that is already found is not tapped again: it costs nothing and is not judged.
export const judgeTap = (gapPlaceIds: readonly string[], foundPlaceIds: readonly string[], tappedPlaceId: string | undefined): MissingTap | null => {
  if (tappedPlaceId === undefined) return { kind: 'sea' };
  if (foundPlaceIds.includes(tappedPlaceId)) return null;
  return { kind: gapPlaceIds.includes(tappedPlaceId) ? 'hit' : 'wrong', placeId: tappedPlaceId };
};

export const isStoredProgress = ({ gapPlaceIds, foundPlaceIds, tapsUsed, easy }: { gapPlaceIds: readonly string[], foundPlaceIds: unknown, tapsUsed: unknown, easy: boolean }) => gapPlaceIds.length === gapCount
  && Array.isArray(foundPlaceIds) && new Set(foundPlaceIds).size === foundPlaceIds.length && foundPlaceIds.every(id => gapPlaceIds.includes(id))
  && Number.isInteger(tapsUsed) && (tapsUsed as number) >= foundPlaceIds.length && (tapsUsed as number) < tapBudgetOf(easy)
  && foundPlaceIds.length < gapCount;
