import type { GameState } from '#shared/game/game';
import type { useLiveRegion } from '~/composables/useLiveRegion';
import { useGameStore } from '~/stores/game';

export const useWayfinderAnnouncements = (state: () => GameState, announce: ReturnType<typeof useLiveRegion>['announce']) => {
  const { t, locale } = useI18n();
  const game = useGameStore();

  const nameOf = (placeId: string) => game.nameOf(placeId, locale.value);

  const detoursLeftText = (count: number) => t('wayfinder.detoursLeft', { count }, count);

  const placeListOf = (placeIds: string[]) => new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(placeIds.map(nameOf));

  const revealTextOf = (round: Extract<GameState, { phase: 'wayfinder' }>, place: string) => {
    const { route, reveal, routes } = round;
    const score = routes.filter(({ outcome }) => outcome === 'complete').length;
    const scoreText = t('wayfinder.live.score', { count: score }, score);
    const shortestRoute = placeListOf(reveal?.shortestRoute ?? []);
    if (route.outcome === 'failed') return t('wayfinder.live.outOfDetours', { place, route: shortestRoute, score: scoreText });
    if (!reveal?.shortestRoute) return t('wayfinder.live.complete', { place, score: scoreText });
    return t('wayfinder.live.completeLonger', { place, shortest: route.shortest, yours: reveal.yourRoute?.length ?? 0, route: shortestRoute, score: scoreText });
  };

  const wayfinderRound = () => {
    const current = state();
    return current.phase === 'wayfinder' ? current : null;
  };

  watch(() => wayfinderRound()?.routeNumber, (routeNumber) => {
    const round = wayfinderRound();
    if (!round || routeNumber === undefined) return;
    announce(t('wayfinder.live.route', { number: routeNumber, start: nameOf(round.route.start), target: nameOf(round.route.target), detours: detoursLeftText(round.detoursLeft) }));
  });

  watch(() => wayfinderRound()?.route.entries.length, (count, previousCount) => {
    const round = wayfinderRound();
    if (!round || !count || count <= (previousCount ?? 0)) return;
    const place = nameOf(round.route.entries.at(-1)!);
    if (round.route.outcome === 'open') announce(t('wayfinder.live.entry', { place, detours: detoursLeftText(round.detoursLeft) }));
    else announce(revealTextOf(round, place));
  });

  watch(() => wayfinderRound()?.rejectedEntries.length, (count) => {
    const rejection = wayfinderRound()?.rejectedEntries.at(-1);
    if (!count || !rejection) return;
    if (rejection.reason === 'ambiguous') announce(t('typed.ambiguous'));
    else if (rejection.reason === 'none') announce(t('typed.live.noMatch'));
    else announce(t(`wayfinder.rejected.${rejection.reason}`, { place: nameOf(rejection.placeId) }));
  });
};
