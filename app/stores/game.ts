import { defineStore } from 'pinia';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { createGame, deepestTierPlayed } from '#shared/game/game';
import type { DailyVariant, DataVersion, Game, GameEvent, GameState, Mode, Place, RoundSetup, Tier } from '#shared/game/game';
import type { Streak } from '#shared/game/daily';
import type { NamesFile, PlaceNames } from '#shared/game/matcher';
import type { DailyRecord } from '#shared/game/records';
import { createStats } from '#shared/game/stats';
import { createYourData } from '#shared/game/your-data';
import type { YourData } from '#shared/game/your-data';
import type { Stats } from '#shared/game/stats';
import { drawSilhouette } from '#shared/utils/silhouette';
import type { Bbox } from '#shared/utils/silhouette';

type Locale = 'en' | 'de';
type ShippedPlace = Place & { bbox: Bbox, silhouetteFrame?: Bbox };

const clockTickMs = 250;

const fetchJson = async <T>(url: string): Promise<T> => (await fetch(url)).json();

export const useGameStore = defineStore('game', () => {
  const state = shallowRef<GameState>({ phase: 'home' });
  const names = shallowRef<NamesFile>({});
  const isReady = ref(false);
  const lastSetup = shallowRef<RoundSetup>();
  const homeTier = ref<Tier>('sovereign');
  const timeLeftMs = ref<number | null>(null);
  const todaysDaily = shallowRef<DailyRecord>();
  const streak = shallowRef<Streak>({ current: 0, longest: 0 });
  const ownLandById = shallowRef<Map<string, Polygon['coordinates'][]>>();
  let shippedPlacesById = new Map<string, ShippedPlace>();
  let ownLandLoad: Promise<void> | undefined;
  let game: Game | undefined;
  let stats: Stats | undefined;
  let yourData: YourData | undefined;

  const load = async () => {
    const [places, placeNames, version] = await Promise.all([
      fetchJson<ShippedPlace[]>('/data/places.json'),
      fetchJson<NamesFile>('/data/names.json'),
      fetchJson<DataVersion>('/data/version.json'),
    ]);
    game = createGame({ places, names: placeNames, version, random: Math.random, clock: Date.now, storage: localStorage });
    stats = createStats({ places, storage: localStorage });
    yourData = createYourData({ storage: localStorage, version, clock: Date.now });
    names.value = placeNames;
    shippedPlacesById = new Map(places.map(place => [place.id, place]));
    state.value = game.state;
    homeTier.value = deepestTierPlayed(localStorage);
    lastSetup.value = game.lastSetup();
    timeLeftMs.value = game.timeLeftMs();
    todaysDaily.value = game.todaysDaily();
    streak.value = game.streak();
    isReady.value = true;
  };

  const send = (event: GameEvent) => {
    if (!game) return;
    game.send(event);
    if (game.state.phase === 'home') {
      homeTier.value = deepestTierPlayed(localStorage);
      todaysDaily.value = game.todaysDaily();
    }
    state.value = game.state;
    streak.value = game.streak();
    lastSetup.value = game.lastSetup();
    timeLeftMs.value = game.timeLeftMs();
  };

  const clockTicker = useIntervalFn(() => send({ type: 'tick' }), clockTickMs, { immediate: false });
  watch(() => timeLeftMs.value !== null, isTimedRoundInPlay => (isTimedRoundInPlay ? clockTicker.resume() : clockTicker.pause()));

  useEventListener(document, 'visibilitychange', () => send({ type: document.hidden ? 'hide' : 'show' }));
  useEventListener(window, 'pagehide', () => send({ type: 'hide' }));

  const play = (setup: RoundSetup) => send({ type: 'start', setup });

  const playDaily = (variant: DailyVariant) => send({ type: 'startDaily', variant });

  const viewDaily = () => send({ type: 'viewDaily' });

  const refreshDaily = () => {
    if (!game) return;
    todaysDaily.value = game.todaysDaily();
    streak.value = game.streak();
  };

  const dailyVariant = () => game!.dailyVariant();

  const setupFor = (mode: Mode) => game!.setupFor(mode);

  const poolOf = (setup: RoundSetup) => game?.poolOf(setup) ?? [];

  const choicesFor = (setup: RoundSetup) => game!.choicesFor(setup);

  const nameOf = (placeId: string, locale: string) => (names.value[placeId] as PlaceNames | undefined)?.[locale as Locale]?.name ?? placeId;

  const capitalNamesOf = (placeId: string, locale: string) => new Intl.ListFormat(locale, { type: 'disjunction' }).format(
    game!.capitalsOf(placeId).flatMap(capitalId => (names.value[placeId] as PlaceNames | undefined)?.capitals?.[capitalId]?.[locale as Locale]?.name ?? []),
  );

  const firstCapitalNameOf = (placeId: string, locale: string) => {
    const [firstCapitalId] = game!.capitalsOf(placeId);
    return (firstCapitalId && (names.value[placeId] as PlaceNames | undefined)?.capitals?.[firstCapitalId]?.[locale as Locale]?.name) || placeId;
  };

  const allGamesStats = () => stats!.allGames();

  const exportData = () => yourData!.exportData();

  const importData = (text: string) => yourData!.importData(text);

  const resetStats = () => yourData!.resetStats();

  const loadOwnLand = () => {
    ownLandLoad ??= fetchJson<FeatureCollection<Polygon | MultiPolygon, { id: string }>>('/data/map-dependencies.geojson').then(({ features }) => {
      ownLandById.value = new Map(features.map(({ properties, geometry }) => [properties.id, geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates]));
    });
  };

  const silhouetteOf = (placeId: string) => {
    const place = shippedPlacesById.get(placeId);
    const ownLand = ownLandById.value?.get(placeId);
    return place && ownLand ? drawSilhouette(ownLand, place.bbox, place.silhouetteFrame) : null;
  };

  return { state, isReady, lastSetup, homeTier, timeLeftMs, todaysDaily, streak, load, send, play, playDaily, viewDaily, refreshDaily, dailyVariant, setupFor, poolOf, choicesFor, nameOf, capitalNamesOf, firstCapitalNameOf, loadOwnLand, silhouetteOf, allGamesStats, exportData, importData, resetStats };
});
