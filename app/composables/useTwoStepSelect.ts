import { isTypedMode } from '#shared/game/game';
import type { GameState } from '#shared/game/game';
import { useGameStore } from '~/stores/game';
import { useSettingsStore } from '~/stores/settings';

export const useTwoStepSelect = (state: () => GameState) => {
  const game = useGameStore();
  const settings = useSettingsStore();
  const markedPlaceId = ref<string | null>(null);

  // A found gap is not judged again, and a sea tap is no place to mark, so both go through as they would without the aid.
  const isMarkable = (placeId: string | undefined): placeId is string => {
    const current = state();
    return settings.isTwoStepSelectOn && placeId !== undefined
      && ((current.phase === 'prompt' && !isTypedMode(current.setup.mode)) || (current.phase === 'missing' && !current.foundPlaceIds.includes(placeId)));
  };

  watch(() => state().phase, () => markedPlaceId.value = null);

  const confirmMark = () => {
    if (!markedPlaceId.value) return;
    game.send({ type: 'tap', placeId: markedPlaceId.value });
    markedPlaceId.value = null;
  };

  const tapPlace = (placeId?: string) => {
    if (!isMarkable(placeId)) game.send({ type: 'tap', placeId });
    else if (placeId === markedPlaceId.value) confirmMark();
    else markedPlaceId.value = placeId;
  };

  return { markedPlaceId: readonly(markedPlaceId), tapPlace, confirmMark };
};
