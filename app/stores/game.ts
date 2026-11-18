import { defineStore } from 'pinia';
import { createGame, deepestTierPlayed } from '#shared/game/game';
import type { DailyVariant, DataVersion, Game, GameEvent, GameState, Mode, Place, RoundSetup, Tier } from '#shared/game/game';
import type { Streak } from '#shared/game/daily';
import type { DailyRecord } from '#shared/game/records';

type Locale = 'en' | 'de';
type PlaceNames = Record<string, Record<Locale, { name: string }>>;

const clockTickMs = 250;

const fetchJson = async <T>(url: string): Promise<T> => (await fetch(url)).json();

export const useGameStore = defineStore('game', () => {
  const state = shallowRef<GameState>({ phase: 'home' });
  const names = shallowRef<PlaceNames>({});
  const isReady = ref(false);
  const lastSetup = shallowRef<RoundSetup>();
  const homeTier = ref<Tier>('sovereign');
  const timeLeftMs = ref<number | null>(null);
  const todaysDaily = shallowRef<DailyRecord>();
  const streak = shallowRef<Streak>({ current: 0, longest: 0 });
  let game: Game | undefined;

  const load = async () => {
    const [places, placeNames, version] = await Promise.all([
      fetchJson<Place[]>('/data/places.json'),
      fetchJson<PlaceNames>('/data/names.json'),
      fetchJson<DataVersion>('/data/version.json'),
    ]);
    game = createGame({ places, version, random: Math.random, clock: Date.now, storage: localStorage });
    names.value = placeNames;
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

  const nameOf = (placeId: string, locale: string) => names.value[placeId]?.[locale as Locale]?.name ?? placeId;

  return { state, isReady, lastSetup, homeTier, timeLeftMs, todaysDaily, streak, load, send, play, playDaily, viewDaily, refreshDaily, dailyVariant, setupFor, poolOf, choicesFor, nameOf };
});
