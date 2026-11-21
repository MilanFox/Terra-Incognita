import { describe, expect, it } from 'vitest';
import shippedNames from '../../public/data/names.json';
import shippedPlaces from '../../public/data/places.json';
import shippedVersion from '../../public/data/version.json';
import { createGame } from './game';
import type { GameState, KeyValueStorage, Place } from './game';
import type { NamesFile, PlaceNames } from './matcher';
import { detourBudget, linkingRoute, mainlandGraphOf, shortestLength } from './wayfinder';
import type { Route, RouteOutcome } from './wayfinder';

const places = shippedPlaces as Place[];
const names = shippedNames as NamesFile;
const today = Date.UTC(2026, 10, 17);
const placesWithoutMainland = ['AUS', 'JPN', 'ISL', 'NZL', 'FJI', 'MDG', 'LKA', 'CUB', 'JAM', 'PHL', 'MLT', 'CYP', 'TWN', 'BHR', 'SGP', 'HTI', 'BRB', 'TON', 'NRU', 'TUV'];

const seededRandom = (seed: number) => {
  let current = seed;
  return () => {
    current = (current + 0x6d2b79f5) | 0;
    let mixed = Math.imul(current ^ (current >>> 15), 1 | current);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const memoryStorage = (): KeyValueStorage => {
  const entries = new Map<string, string>();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
};

const boot = ({ seed = 1, storage = memoryStorage(), clock = () => today }: { seed?: number, storage?: KeyValueStorage, clock?: () => number } = {}) =>
  createGame({ places, names, version: shippedVersion, random: seededRandom(seed), clock, storage });

type Game = ReturnType<typeof boot>;

const startWayfinder = (options: Parameters<typeof boot>[0] = {}) => {
  const game = boot(options);
  game.send({ type: 'start', setup: game.setupFor('wayfinder') });
  return game;
};

const routeOf = (game: Game) => {
  const { state } = game;
  if (state.phase !== 'wayfinder') throw new Error(`Expected a route, got ${state.phase}`);
  return state;
};

const resultsOf = (game: Game) => {
  const { state } = game;
  if (state.phase !== 'wayfinderResults') throw new Error(`Expected Wayfinder results, got ${state.phase}`);
  return state;
};

const nameOf = (placeId: string, language: 'en' | 'de' = 'en') => (names[placeId] as PlaceNames)[language].name;

const enter = (game: Game, placeIds: readonly string[]) => {
  for (const placeId of placeIds) game.send({ type: 'submit', text: nameOf(placeId) });
};

const mainlandNeighboursOf = new Map(places.map(({ id, mainlandNeighbours = [] }) => [id, mainlandNeighbours]));

const shortestInBetween = (start: string, target: string) => {
  const previousOf = new Map<string, string>([[start, start]]);
  const queue = [start];
  for (const current of queue) {
    for (const next of mainlandNeighboursOf.get(current)!) {
      if (previousOf.has(next)) continue;
      previousOf.set(next, current);
      queue.push(next);
    }
  }
  const between: string[] = [];
  for (let current = previousOf.get(target)!; current !== start; current = previousOf.get(current)!) between.unshift(current);
  return between;
};

const reachableFrom = (start: string) => {
  const reached = new Set([start]);
  for (const current of reached) mainlandNeighboursOf.get(current)!.forEach(next => reached.add(next));
  return reached;
};

const afroEurasia = reachableFrom('EGY');
const americas = reachableFrom('PAN');

const playCleanly = (game: Game) => {
  const { route } = routeOf(game);
  enter(game, shortestInBetween(route.start, route.target));
  game.send({ type: 'next' });
  return route;
};

const storedRoundOf = (routes: { start: string, target: string, outcome: RouteOutcome }[], seed = 1) => {
  const storage = memoryStorage();
  storage.setItem('ti:round', JSON.stringify({
    setup: { mode: 'wayfinder', variant: 'map', region: 'world', tier: 'sovereign', deckSize: 10, easy: false, timed: false },
    routes: routes.map(route => ({ ...route, shortest: 0, entries: [], detours: 0 })),
    startedAt: today,
    hiddenAt: today,
    stoppedMs: 0,
    dataVersion: shippedVersion.dataVersion,
  }));
  return boot({ storage, seed });
};

const storedRoundFrom = (start: string, target: string) => storedRoundOf([{ start, target, outcome: 'open' }]);

const storedJson = (storage: KeyValueStorage, key: string) => JSON.parse(storage.getItem(key) ?? 'null');

const spendDetours = (game: Game) => {
  const { route, detoursLeft } = routeOf(game);
  enter(game, placesWithoutMainland.slice(0, Math.max(0, route.shortest - route.entries.length) + detoursLeft));
  game.send({ type: 'next' });
};

describe('Wayfinder setup', () => {
  it('is whole world and sovereign tier only, untimed, with no deck', () => {
    const game = boot();

    expect(game.setupFor('wayfinder')).toEqual({ mode: 'wayfinder', variant: 'map', region: 'world', tier: 'sovereign', deckSize: 10, easy: false, timed: false });

    game.send({ type: 'start', setup: { ...game.setupFor('wayfinder'), region: 'Europe', tier: 'dependencies', timed: true, deckSize: 'all' } });

    expect(routeOf(game).setup).toEqual(game.setupFor('wayfinder'));
  });

  it('is remembered and played again', () => {
    const storage = memoryStorage();
    startWayfinder({ storage });

    expect(boot({ storage }).lastSetup()).toMatchObject({ mode: 'wayfinder' });
  });

  it('starts on the first route with no places named and five detours', () => {
    expect(routeOf(startWayfinder())).toMatchObject({ routeNumber: 1, route: { entries: [], detours: 0, outcome: 'open' }, detoursLeft: detourBudget, rejectedEntries: [], isConfirmingEnd: false });
    expect(detourBudget).toBe(5);
  });
});

describe('Easy mode', () => {
  it('plays the same round with the same detours, and is remembered', () => {
    const storage = memoryStorage();
    const game = boot({ storage });
    game.send({ type: 'start', setup: { ...game.setupFor('wayfinder'), easy: true } });

    expect(routeOf(game)).toMatchObject({ setup: { easy: true }, routeNumber: 1, detoursLeft: detourBudget });
    expect(boot({ storage: memoryStorage() }).setupFor('wayfinder').easy).toBe(false);
    expect(boot({ storage }).setupFor('wayfinder').easy).toBe(true);
  });
});

describe('a route', () => {
  it('takes the first entries up to the shortest route\'s length for free, even off the route', () => {
    const game = startWayfinder();
    const { route } = routeOf(game);
    const freeEntries = placesWithoutMainland.slice(0, route.shortest);

    enter(game, freeEntries);

    expect(routeOf(game)).toMatchObject({ detoursLeft: 5, route: { entries: freeEntries, detours: 0, outcome: 'open' } });

    enter(game, placesWithoutMainland.slice(route.shortest, route.shortest + 1));

    expect(routeOf(game)).toMatchObject({ detoursLeft: 4, route: { detours: 1, outcome: 'open' } });
  });

  it('counts every place it resolves as an entry: off the route, without land borders, outside the sovereign tier, in German', () => {
    const game = startWayfinder();

    game.send({ type: 'submit', text: 'Island' });
    game.send({ type: 'submit', text: 'Gibraltar' });
    game.send({ type: 'submit', text: 'Western Sahara' });

    expect(routeOf(game).route.entries).toEqual(['ISL', 'GIB', 'SAH']);
  });

  it('takes nothing for ambiguous or unknown input, a place named twice, the start or the target', () => {
    const game = startWayfinder();
    const { route } = routeOf(game);
    enter(game, ['ISL']);
    const before = routeOf(game);

    game.send({ type: 'submit', text: 'congo' });
    game.send({ type: 'submit', text: 'atlantis' });
    game.send({ type: 'submit', text: '' });
    enter(game, ['ISL', route.start, route.target]);

    expect(routeOf(game)).toMatchObject({ route: before.route, detoursLeft: before.detoursLeft });
    expect(routeOf(game).rejectedEntries).toEqual([
      { reason: 'ambiguous' },
      { reason: 'none' },
      { reason: 'none' },
      { reason: 'named', placeId: 'ISL' },
      { reason: 'start', placeId: route.start },
      { reason: 'target', placeId: route.target },
    ]);
  });

  it('clears the rejected input once a place is taken', () => {
    const game = startWayfinder();
    game.send({ type: 'submit', text: 'congo' });
    enter(game, ['ISL']);

    expect(routeOf(game).rejectedEntries).toEqual([]);
  });

  it('is never entered by a tap on the map', () => {
    const game = startWayfinder();
    const before = game.state;

    game.send({ type: 'tap', placeId: shortestInBetween(routeOf(game).route.start, routeOf(game).route.target)[0] });

    expect(game.state).toEqual(before);
  });
});

describe('completing a route', () => {
  it('happens as soon as the named places link start and target, in any order', () => {
    const game = startWayfinder();
    const { route } = routeOf(game);
    const between = shortestInBetween(route.start, route.target).reverse();

    enter(game, between.slice(0, -1));

    expect(routeOf(game).route.outcome).toBe('open');

    enter(game, between.slice(-1));

    expect(routeOf(game)).toMatchObject({ detoursLeft: 5, route: { entries: between, detours: 0, outcome: 'complete' } });
  });

  it('happens by any linking route, a longer one included, and keeps places named in vain', () => {
    const game = storedRoundFrom('PRT', 'POL');

    expect(routeOf(game).route).toMatchObject({ start: 'PRT', target: 'POL', shortest: 3 });

    enter(game, ['ISL', 'CHE', 'ESP', 'CZE', 'FRA']);

    expect(routeOf(game).route.outcome).toBe('open');

    enter(game, ['AUT']);

    expect(routeOf(game)).toMatchObject({ detoursLeft: 2, route: { entries: ['ISL', 'CHE', 'ESP', 'CZE', 'FRA', 'AUT'], detours: 3, outcome: 'complete' } });
  });

  it('waits for Next, taking no more entries, then draws the next route', () => {
    const game = startWayfinder();
    const { route } = routeOf(game);
    enter(game, shortestInBetween(route.start, route.target));
    enter(game, ['ISL']);

    expect(routeOf(game)).toMatchObject({ routeNumber: 1, route: { outcome: 'complete', entries: shortestInBetween(route.start, route.target) } });

    game.send({ type: 'next' });

    expect(routeOf(game)).toMatchObject({ routeNumber: 2, route: { entries: [], detours: 0, outcome: 'open' }, detoursLeft: 5 });
    expect(routeOf(game).routes.map(({ outcome }) => outcome)).toEqual(['complete', 'open']);
  });

  it('ignores Next while the route is open', () => {
    const game = startWayfinder();
    const before = game.state;

    game.send({ type: 'next' });

    expect(game.state).toEqual(before);
  });
});

describe('detours', () => {
  it('never refill: a route finished without detours earns nothing back', () => {
    const game = startWayfinder();
    const { route } = routeOf(game);
    enter(game, placesWithoutMainland.slice(0, 2));
    enter(game, shortestInBetween(route.start, route.target));

    expect(routeOf(game)).toMatchObject({ detoursLeft: 3, route: { detours: 2, outcome: 'complete' } });

    game.send({ type: 'next' });
    playCleanly(game);

    expect(routeOf(game)).toMatchObject({ routeNumber: 3, detoursLeft: 3 });
  });

  it('end the round when the last one is spent mid-route: the route fails, and after Next the round is complete', () => {
    const storage = memoryStorage();
    const game = startWayfinder({ storage });
    const { route } = routeOf(game);
    enter(game, placesWithoutMainland.slice(0, route.shortest + 4));

    expect(routeOf(game)).toMatchObject({ detoursLeft: 1, route: { outcome: 'open' } });

    enter(game, placesWithoutMainland.slice(route.shortest + 4, route.shortest + 5));

    expect(routeOf(game)).toMatchObject({ detoursLeft: 0, route: { outcome: 'failed' } });

    game.send({ type: 'next' });

    expect(resultsOf(game)).toMatchObject({ isComplete: true, routes: [{ outcome: 'failed', detours: 5 }] });
    expect(storage.getItem('ti:round')).toBeNull();
  });

  it('let the entry that spends the last one complete the route first, then the round ends after Next', () => {
    const game = startWayfinder();
    const { route } = routeOf(game);
    const between = shortestInBetween(route.start, route.target);
    enter(game, between.slice(0, -1));
    enter(game, placesWithoutMainland.slice(0, 5));

    expect(routeOf(game)).toMatchObject({ detoursLeft: 1, route: { outcome: 'open' } });

    enter(game, between.slice(-1));

    expect(routeOf(game)).toMatchObject({ detoursLeft: 0, route: { outcome: 'complete', detours: 5 } });

    game.send({ type: 'next' });

    expect(resultsOf(game)).toMatchObject({ isComplete: true, routes: [{ outcome: 'complete', detours: 5 }] });
  });

  it('carry over from route to route until the round ends', () => {
    const game = startWayfinder();
    const first = routeOf(game).route;
    enter(game, placesWithoutMainland.slice(0, 3));
    enter(game, shortestInBetween(first.start, first.target));
    game.send({ type: 'next' });

    expect(routeOf(game).detoursLeft).toBe(2);

    const second = routeOf(game).route;
    enter(game, placesWithoutMainland.slice(0, second.shortest + 2));

    expect(routeOf(game)).toMatchObject({ detoursLeft: 0, route: { outcome: 'failed' } });
  });
});

describe('end round', () => {
  it('halts play while it asks, and Keep playing returns to the route', () => {
    const game = startWayfinder();
    game.send({ type: 'askEnd' });
    const asking = routeOf(game);

    enter(game, ['ISL']);
    game.send({ type: 'next' });

    expect(game.state).toEqual(asking);
    expect(asking.isConfirmingEnd).toBe(true);

    game.send({ type: 'keepPlaying' });
    enter(game, ['ISL']);

    expect(routeOf(game)).toMatchObject({ isConfirmingEnd: false, route: { entries: ['ISL'] } });
  });

  it('ends the round incomplete with the route it was on, and leaves no stored round', () => {
    const storage = memoryStorage();
    const game = startWayfinder({ storage });
    const first = playCleanly(game);
    enter(game, ['ISL']);
    game.send({ type: 'askEnd' });
    game.send({ type: 'end' });

    expect(resultsOf(game)).toMatchObject({ isComplete: false, routes: [{ start: first.start, outcome: 'complete' }, { entries: ['ISL'], outcome: 'open' }] });
    expect(storage.getItem('ti:round')).toBeNull();

    game.send({ type: 'leave' });

    expect(game.state).toEqual({ phase: 'home' });
  });

  it('leads to results that play again or start another mode', () => {
    const game = startWayfinder();
    game.send({ type: 'askEnd' });
    game.send({ type: 'end' });
    game.send({ type: 'start', setup: game.setupFor('wayfinder') });

    expect(routeOf(game)).toMatchObject({ routeNumber: 1, detoursLeft: 5 });

    game.send({ type: 'askEnd' });
    game.send({ type: 'end' });
    game.send({ type: 'start', setup: game.setupFor('find') });

    expect(game.state).toMatchObject({ phase: 'prompt', promptNumber: 1 });
  });
});

describe('how pairs are drawn', () => {
  const firstRoutes = (() => {
    const game = boot({ seed: 11 });
    return Array.from({ length: 300 }, () => {
      game.send({ type: 'start', setup: game.setupFor('wayfinder') });
      const { route } = routeOf(game);
      game.send({ type: 'askEnd' });
      game.send({ type: 'end' });
      return route;
    });
  })();
  const averageLength = (routes: Route[]) => routes.reduce((sum, { shortest }) => sum + shortest, 0) / routes.length;

  it('draw a start with a mainland and a target from its block, at least 3 places apart', () => {
    for (const { start, target, shortest } of firstRoutes) {
      expect([start, target].every(placeId => mainlandNeighboursOf.get(placeId)!.length > 0)).toBe(true);
      expect(afroEurasia.has(start) ? afroEurasia.has(target) : americas.has(start) && americas.has(target)).toBe(true);
      expect(shortest).toBe(shortestInBetween(start, target).length);
      expect(shortest).toBeGreaterThanOrEqual(3);
    }
  });

  it('draw from both blocks and let single-neighbour places and enclaves be a start or a target', () => {
    const endpoints = firstRoutes.flatMap(({ start, target }) => [start, target]);

    expect(endpoints.some(placeId => americas.has(placeId))).toBe(true);
    expect(endpoints.some(placeId => afroEurasia.has(placeId))).toBe(true);
    expect(endpoints.some(placeId => mainlandNeighboursOf.get(placeId)!.length === 1)).toBe(true);
  });

  it('aim at a target length that starts at 4 and rises by half a place per route, with no cap', () => {
    const earlierPairs = [['PRT', 'POL'], ['ESP', 'DEU'], ['FRA', 'AUT'], ['ITA', 'HUN'], ['DEU', 'ROU'], ['NLD', 'CZE'], ['BEL', 'SVK'], ['CHE', 'POL'], ['AUT', 'LTU'], ['HUN', 'UKR'], ['CZE', 'BLR'], ['MEX', 'PAN']];
    const thirteenthRoutes = Array.from({ length: 60 }, (_, index) => {
      const game = storedRoundOf(earlierPairs.map(([start, target]) => ({ start: start!, target: target!, outcome: 'complete' })), index + 1);
      game.send({ type: 'next' });
      return routeOf(game).route;
    });

    expect(averageLength(firstRoutes)).toBeGreaterThan(3.7);
    expect(averageLength(firstRoutes)).toBeLessThan(5);
    expect(averageLength(thirteenthRoutes)).toBeGreaterThan(averageLength(firstRoutes) + 3.5);
    expect(Math.max(...thirteenthRoutes.map(({ shortest }) => shortest))).toBeGreaterThan(10);
  });

  it('never repeat a pair in a round, in either direction', () => {
    const game = startWayfinder({ seed: 7 });
    const pairs = Array.from({ length: 12 }, () => playCleanly(game)).map(({ start, target }) => [start, target].sort().join('-'));

    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('redraw the start only when it has no unused pair left', () => {
    const afroEurasianPairs = [...afroEurasia].flatMap(start => [...afroEurasia]
      .filter(target => start < target && shortestInBetween(start, target).length >= 3)
      .map(target => ({ start, target, outcome: 'complete' as const })));
    const drawnAfter = [1, 2, 3].map((seed) => {
      const game = storedRoundOf(afroEurasianPairs, seed);
      game.send({ type: 'next' });
      return routeOf(game).route;
    });

    expect(drawnAfter.every(({ start, target }) => americas.has(start) && americas.has(target))).toBe(true);
  });

  it('come from the injected random source', () => {
    const pairOf = (seed: number) => {
      const { start, target } = routeOf(startWayfinder({ seed })).route;
      return `${start}-${target}`;
    };

    expect(pairOf(3)).toBe(pairOf(3));
    expect(new Set(Array.from({ length: 20 }, (_, index) => pairOf(index + 1))).size).toBeGreaterThan(15);
  });
});

describe('mainland only', () => {
  it('drops the border through an exclave: Kaliningrad links nothing', () => {
    const game = storedRoundFrom('DEU', 'LVA');
    enter(game, ['POL', 'RUS']);

    expect(routeOf(game).route.outcome).toBe('open');

    enter(game, ['LTU']);

    expect(routeOf(game).route.outcome).toBe('complete');
  });

  it('drops the border through Ceuta and Melilla: Spain and Morocco are not linked', () => {
    const game = storedRoundFrom('PRT', 'DZA');
    enter(game, ['ESP', 'MAR']);

    expect(routeOf(game).route.outcome).toBe('open');
  });

  it('drops overseas parts and keeps the two blocks apart: French Guiana links France to nothing in the Americas', () => {
    const graph = mainlandGraphOf(places);

    expect(shortestLength(graph, 'FRA', 'SUR')).toBeNull();
    expect(shortestLength(graph, 'FRA', 'BRA')).toBeNull();
    expect(shortestLength(graph, 'SUR', 'BRA')).toBe(0);
  });

  it('keeps places without a mainland out of every pair, but they can be typed as entries', () => {
    const game = startWayfinder();
    enter(game, ['GBR', 'IRL']);

    expect(routeOf(game).route.entries).toEqual(['GBR', 'IRL']);
    expect(mainlandGraphOf(places).has('GBR')).toBe(false);
    expect(mainlandGraphOf(places).size).toBe(149);
  });

  it('lets an enclave be a start, linked through the place around it', () => {
    const game = storedRoundFrom('LSO', 'NAM');
    enter(game, ['ZAF']);

    expect(routeOf(game).route.outcome).toBe('complete');
  });

  it('gives the linking route through the named places only, for the reveal', () => {
    const graph = mainlandGraphOf(places);

    expect(linkingRoute(graph, { start: 'PRT', target: 'POL', entries: ['ISL', 'CHE', 'ESP', 'CZE', 'FRA', 'AUT'] })).toEqual(['PRT', 'ESP', 'FRA', 'CHE', 'AUT', 'CZE', 'POL']);
    expect(linkingRoute(graph, { start: 'PRT', target: 'DZA', entries: ['ESP', 'MAR'] })).toBeNull();
  });
});

describe('the reveal', () => {
  it('waits until the route is finished', () => {
    const game = storedRoundFrom('PRT', 'POL');
    enter(game, ['ESP', 'FRA']);

    expect(routeOf(game).reveal).toBeNull();
  });

  it('shows your route alone when it is a shortest one', () => {
    const game = storedRoundFrom('PRT', 'POL');
    enter(game, ['DEU', 'ESP', 'FRA']);

    expect(routeOf(game).reveal).toEqual({ yourRoute: ['ESP', 'FRA', 'DEU'], shortestRoute: null });
  });

  it('shows your route through your own places, and where it is longer one shortest route', () => {
    const game = storedRoundFrom('PRT', 'POL');
    enter(game, ['ISL', 'CHE', 'ESP', 'CZE', 'FRA', 'AUT']);

    expect(routeOf(game).reveal).toEqual({ yourRoute: ['ESP', 'FRA', 'CHE', 'AUT', 'CZE'], shortestRoute: ['ESP', 'FRA', 'DEU'] });
  });

  it('picks the shortest route that shares the most places with yours', () => {
    const game = storedRoundFrom('ESP', 'SVK');
    enter(game, ['FRA', 'ITA', 'SVN', 'HUN']);

    expect(routeOf(game).reveal).toEqual({ yourRoute: ['FRA', 'ITA', 'SVN', 'HUN'], shortestRoute: ['FRA', 'ITA', 'AUT'] });
  });

  it('shows one shortest route and no route of yours when the detours run out', () => {
    const game = storedRoundFrom('PRT', 'POL');
    enter(game, ['ESP', ...placesWithoutMainland.slice(0, 7)]);

    expect(routeOf(game)).toMatchObject({ detoursLeft: 0, route: { outcome: 'failed' }, reveal: { yourRoute: null, shortestRoute: ['ESP', 'FRA', 'DEU'] } });
  });

  it('comes back after a relaunch', () => {
    const storage = memoryStorage();
    const game = startWayfinder({ storage });
    const { route } = routeOf(game);
    enter(game, shortestInBetween(route.start, route.target));

    expect(routeOf(boot({ storage })).reveal).toEqual({ yourRoute: shortestInBetween(route.start, route.target), shortestRoute: null });
  });
});

describe('results', () => {
  it('score the routes completed and count those without detours', () => {
    const game = startWayfinder();
    playCleanly(game);
    const { route } = routeOf(game);
    const between = shortestInBetween(route.start, route.target);
    enter(game, between.slice(0, -1));
    enter(game, placesWithoutMainland.slice(0, 2));
    enter(game, between.slice(-1));

    expect(routeOf(game)).toMatchObject({ detoursLeft: 3, route: { detours: 2, outcome: 'complete' } });

    game.send({ type: 'next' });
    spendDetours(game);

    expect(resultsOf(game)).toMatchObject({ score: 2, routesWithoutDetours: 1, isComplete: true });
    expect(resultsOf(game).routes.map(({ outcome }) => outcome)).toEqual(['complete', 'complete', 'failed']);
  });

  it('log a round ended by its spent detours as complete, with its elapsed time, and count it for the best', () => {
    let now = 1_000_000;
    const storage = memoryStorage();
    const game = startWayfinder({ storage, clock: () => now });
    now += 40_000;
    playCleanly(game);
    now += 25_000;
    spendDetours(game);

    expect(resultsOf(game)).toMatchObject({ score: 1, isComplete: true, elapsedMs: 65_000, isNewBest: true });
    expect(storedJson(storage, 'ti:rounds')).toEqual([{
      date: 1_000_000,
      mode: 'wayfinder',
      variant: 'map',
      region: 'world',
      tier: 'sovereign',
      deckSize: 2,
      timed: false,
      easy: false,
      daily: false,
      learn: false,
      score: 1,
      complete: true,
      elapsedMs: 65_000,
      pausesUsed: 0,
      dataVersion: shippedVersion.dataVersion,
    }]);
    expect(storedJson(storage, 'ti:bests')).toEqual({ 'wayfinder:normal': { score: 1, fastestPerfectMs: null } });
  });

  it('log a round ended with End round as incomplete, and leave the best alone', () => {
    const storage = memoryStorage();
    const game = startWayfinder({ storage });
    playCleanly(game);
    game.send({ type: 'askEnd' });
    game.send({ type: 'end' });

    expect(resultsOf(game)).toMatchObject({ score: 1, isComplete: false, isNewBest: false });
    expect(storedJson(storage, 'ti:rounds')).toEqual([expect.objectContaining({ mode: 'wayfinder', score: 1, complete: false })]);
    expect(storage.getItem('ti:bests')).toBeNull();
  });

  it('keep one personal best per Easy setting, with no tier in its key and no fastest perfect', () => {
    const storage = memoryStorage();
    const game = boot({ storage });
    const play = (easy: boolean, cleanRoutes: number) => {
      game.send({ type: 'start', setup: { ...game.setupFor('wayfinder'), easy } });
      Array.from({ length: cleanRoutes }, () => playCleanly(game));
      spendDetours(game);
      return resultsOf(game);
    };

    expect(play(false, 2).isNewBest).toBe(true);
    expect(play(false, 1).isNewBest).toBe(false);
    expect(play(true, 1)).toMatchObject({ isNewBest: true, setup: { easy: true } });
    expect(play(true, 3).isNewBest).toBe(true);
    expect(storedJson(storage, 'ti:bests')).toEqual({
      'wayfinder:normal': { score: 2, fastestPerfectMs: null },
      'wayfinder:easy': { score: 3, fastestPerfectMs: null },
    });
    expect(storedJson(storage, 'ti:rounds').map(({ easy }: { easy: boolean }) => easy)).toEqual([false, false, true, true]);
  });

  it('record no fastest perfect, even when every route was completed', () => {
    const storage = memoryStorage();
    const game = startWayfinder({ storage });
    playCleanly(game);
    const { route } = routeOf(game);
    const between = shortestInBetween(route.start, route.target);
    enter(game, between.slice(0, -1));
    enter(game, placesWithoutMainland.slice(0, 5));
    enter(game, between.slice(-1));
    game.send({ type: 'next' });

    expect(resultsOf(game)).toMatchObject({ score: 2, routesWithoutDetours: 1, isComplete: true });
    expect(storedJson(storage, 'ti:bests')).toEqual({ 'wayfinder:normal': { score: 2, fastestPerfectMs: null } });
  });
});

describe('resuming an interrupted Wayfinder round', () => {
  it('returns to the same route with its entries and the detours left after a relaunch', () => {
    const storage = memoryStorage();
    const game = startWayfinder({ storage });
    playCleanly(game);
    const { route } = routeOf(game);
    enter(game, placesWithoutMainland.slice(0, route.shortest + 1));
    const before = game.state;

    expect(storage.getItem('ti:round')).not.toBeNull();

    const resumed = boot({ storage });

    expect(resumed.state).toEqual(before);
    expect(resumed.state).toMatchObject({ phase: 'wayfinder', routeNumber: 2, detoursLeft: 4 });
  });

  it('returns to a finished route waiting for Next, and draws no repeated pair after it', () => {
    const storage = memoryStorage();
    const game = startWayfinder({ storage });
    const { route } = routeOf(game);
    enter(game, shortestInBetween(route.start, route.target));

    const resumed = boot({ storage, seed: 1 });

    expect(routeOf(resumed).route).toMatchObject({ outcome: 'complete' });

    resumed.send({ type: 'next' });

    expect(routeOf(resumed).routeNumber).toBe(2);
    expect([routeOf(resumed).route.start, routeOf(resumed).route.target].sort()).not.toEqual([route.start, route.target].sort());
  });

  it('writes the round on hide and leaves the time away out of the elapsed time', () => {
    let now = 1_000_000;
    const storage = memoryStorage();
    const game = startWayfinder({ storage, clock: () => now });
    now += 10_000;
    game.send({ type: 'hide' });

    expect(JSON.parse(storage.getItem('ti:round')!)).toMatchObject({ startedAt: 1_000_000, hiddenAt: 1_010_000 });

    now += 60_000;
    const resumed = boot({ storage, clock: () => now });
    now += 5_000;
    resumed.send({ type: 'askEnd' });
    resumed.send({ type: 'end' });

    expect(resultsOf(resumed).elapsedMs).toBe(15_000);
  });

  it('drops a damaged stored round and starts at home', () => {
    for (const damaged of ['{"setup":{"mode":"wayfinder"},"routes":[{"start":"DEU","target":"XXX"}]}', '{"setup":{"mode":"wayfinder"},"routes":[]}', 'not json']) {
      const storage = memoryStorage();
      storage.setItem('ti:round', damaged);

      expect(boot({ storage }).state).toEqual({ phase: 'home' } satisfies GameState);
      expect(storage.getItem('ti:round')).toBeNull();
    }
  });
});

describe('the places the camera frames', () => {
  it('are the start and the target when a route begins', () => {
    const game = storedRoundFrom('LBY', 'SWZ');

    expect(routeOf(game).framedPlaceIds).toEqual(['LBY', 'SWZ']);
  });

  it('stay put for a pick that is not linked to the start or the target', () => {
    const game = storedRoundFrom('RUS', 'GAB');
    enter(game, ['PLW', 'TUV', 'DEU', 'LUX']);

    expect(routeOf(game).framedPlaceIds).toEqual(['RUS', 'GAB']);
  });

  it('take in a pick linked to the start or the target over mainland borders', () => {
    const game = storedRoundFrom('RUS', 'GAB');
    enter(game, ['KAZ', 'COG']);

    expect(routeOf(game).framedPlaceIds).toEqual(['RUS', 'GAB', 'KAZ', 'COG']);
  });

  it('take in an earlier unlinked pick once a later pick links it', () => {
    const game = storedRoundFrom('RUS', 'GAB');
    enter(game, ['UZB', 'TUV']);

    expect(routeOf(game).framedPlaceIds).toEqual(['RUS', 'GAB']);

    enter(game, ['KAZ']);

    expect(routeOf(game).framedPlaceIds).toEqual(['RUS', 'GAB', 'UZB', 'KAZ']);
  });

  it('are the shortest route alone at the reveal when yours is the shortest, without the picks off it', () => {
    const game = storedRoundFrom('PRT', 'POL');
    enter(game, ['TUV', 'ITA', 'ESP', 'FRA', 'DEU']);

    expect(routeOf(game)).toMatchObject({ route: { outcome: 'complete' }, framedPlaceIds: ['PRT', 'POL', 'ESP', 'FRA', 'DEU'] });
  });

  it('are the shortest route and yours at the reveal when yours is longer', () => {
    const game = storedRoundFrom('PRT', 'POL');
    enter(game, ['ISL', 'CHE', 'ESP', 'CZE', 'FRA', 'AUT']);

    expect(routeOf(game).framedPlaceIds).toEqual(['PRT', 'POL', 'ESP', 'FRA', 'DEU', 'CHE', 'AUT', 'CZE']);
  });

  it('are the shortest route when the detours run out mid-route, without the picks made', () => {
    const game = storedRoundFrom('PRT', 'POL');
    enter(game, ['ESP', 'AND', ...placesWithoutMainland.slice(0, 6)]);

    expect(routeOf(game)).toMatchObject({ route: { outcome: 'failed' }, framedPlaceIds: ['PRT', 'POL', 'ESP', 'FRA', 'DEU'] });
  });
});
