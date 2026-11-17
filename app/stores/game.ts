import { defineStore } from 'pinia';
import { createGame, deepestTierPlayed } from '#shared/game/game';
import type { DataVersion, Game, GameEvent, GameState, Mode, Place, RoundSetup, Tier } from '#shared/game/game';

type Locale = 'en' | 'de';
type PlaceNames = Record<string, Record<Locale, { name: string }>>;

const fetchJson = async <T>(url: string): Promise<T> => (await fetch(url)).json();

export const useGameStore = defineStore('game', () => {
  const state = shallowRef<GameState>({ phase: 'home' });
  const names = shallowRef<PlaceNames>({});
  const isReady = ref(false);
  const lastSetup = shallowRef<RoundSetup>();
  const homeTier = ref<Tier>('sovereign');
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
    isReady.value = true;
  };

  const send = (event: GameEvent) => {
    if (!game) return;
    game.send(event);
    if (game.state.phase === 'home') homeTier.value = deepestTierPlayed(localStorage);
    state.value = game.state;
    lastSetup.value = game.lastSetup();
  };

  useEventListener(document, 'visibilitychange', () => send({ type: document.hidden ? 'hide' : 'show' }));
  useEventListener(window, 'pagehide', () => send({ type: 'hide' }));

  const play = (setup: RoundSetup) => send({ type: 'start', setup });

  const setupFor = (mode: Mode) => game!.setupFor(mode);

  const poolOf = (setup: RoundSetup) => game?.poolOf(setup) ?? [];

  const choicesFor = (setup: RoundSetup) => game!.choicesFor(setup);

  const nameOf = (placeId: string, locale: string) => names.value[placeId]?.[locale as Locale]?.name ?? placeId;

  return { state, isReady, lastSetup, homeTier, load, send, play, setupFor, poolOf, choicesFor, nameOf };
});
