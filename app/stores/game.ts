import { defineStore } from 'pinia';
import { createGame } from '#shared/game/game';
import type { Game, GameEvent, GameState, Mode, Place, RoundSetup } from '#shared/game/game';

type Locale = 'en' | 'de';
type PlaceNames = Record<string, Record<Locale, { name: string }>>;

const fetchJson = async <T>(url: string): Promise<T> => (await fetch(url)).json();

export const useGameStore = defineStore('game', () => {
  const state = shallowRef<GameState>({ phase: 'home' });
  const names = shallowRef<PlaceNames>({});
  const isReady = ref(false);
  const lastSetup = shallowRef<RoundSetup>();
  let game: Game | undefined;

  const load = async () => {
    const [places, placeNames] = await Promise.all([
      fetchJson<Place[]>('/data/places.json'),
      fetchJson<PlaceNames>('/data/names.json'),
    ]);
    game = createGame({ places, random: Math.random, clock: Date.now, storage: localStorage });
    names.value = placeNames;
    state.value = game.state;
    lastSetup.value = game.lastSetup();
    isReady.value = true;
  };

  const send = (event: GameEvent) => {
    if (!game) return;
    game.send(event);
    state.value = game.state;
    lastSetup.value = game.lastSetup();
  };

  const play = (setup: RoundSetup) => send({ type: 'start', setup });

  const setupFor = (mode: Mode) => game!.setupFor(mode);

  const poolOf = (setup: RoundSetup) => game?.poolOf(setup) ?? [];

  const choicesFor = (setup: RoundSetup) => game!.choicesFor(setup);

  const nameOf = (placeId: string, locale: string) => names.value[placeId]?.[locale as Locale]?.name ?? placeId;

  return { state, isReady, lastSetup, load, send, play, setupFor, poolOf, choicesFor, nameOf };
});
