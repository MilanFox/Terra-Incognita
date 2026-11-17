import { defineStore } from 'pinia';
import { createGame } from '#shared/game/game';
import type { Game, GameEvent, GameState, Mode, Place } from '#shared/game/game';

type Locale = 'en' | 'de';
type PlaceNames = Record<string, Record<Locale, { name: string }>>;

const fetchJson = async <T>(url: string): Promise<T> => (await fetch(url)).json();

export const useGameStore = defineStore('game', () => {
  const state = shallowRef<GameState>({ phase: 'home' });
  const names = shallowRef<PlaceNames>({});
  const isReady = ref(false);
  let game: Game | undefined;

  const load = async () => {
    const [places, placeNames] = await Promise.all([
      fetchJson<Place[]>('/data/places.json'),
      fetchJson<PlaceNames>('/data/names.json'),
    ]);
    game = createGame({ places, random: Math.random, clock: Date.now, storage: localStorage });
    names.value = placeNames;
    state.value = game.state;
    isReady.value = true;
  };

  const send = (event: GameEvent) => {
    if (!game) return;
    game.send(event);
    state.value = game.state;
  };

  const play = (mode: Mode) => game && send({ type: 'start', setup: game.setupFor(mode) });

  const nameOf = (placeId: string, locale: string) => names.value[placeId]?.[locale as Locale]?.name ?? placeId;

  return { state, isReady, load, send, play, nameOf };
});
