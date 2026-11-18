import type { GameEvent, KeyValueStorage, Place, RoundSetup } from './game';
import type { Matcher, Resolution } from './matcher';

export const detourBudget = 5;
const minimumRouteLength = 3;
const firstTargetLength = 4;
const targetLengthRise = 0.5;
const targetLengthSpread = 1.5;
const roundStorageKey = 'ti:round';

export type RouteOutcome = 'open' | 'complete' | 'failed';

export interface Route {
  start: string
  target: string
  shortest: number
  entries: string[]
  detours: number
  outcome: RouteOutcome
}

export type RejectedEntry
  = | { reason: 'ambiguous' }
    | { reason: 'none' }
    | { reason: 'named' | 'start' | 'target', placeId: string };

export type WayfinderState
  = | { phase: 'wayfinder', setup: RoundSetup, routeNumber: number, route: Route, routes: Route[], detoursLeft: number, rejectedEntries: RejectedEntry[], isConfirmingEnd: boolean }
    | { phase: 'wayfinderResults', setup: RoundSetup, routes: Route[], isComplete: boolean, elapsedMs: number };

export type MainlandGraph = ReadonlyMap<string, readonly string[]>;

interface WayfinderDependencies {
  places: readonly Place[]
  matcher: Matcher
  random: () => number
  clock: () => number
  storage: KeyValueStorage
  dataVersion: number
}

interface StoredWayfinderRound {
  setup: RoundSetup
  routes: Route[]
  startedAt: number
  hiddenAt: number | null
  stoppedMs: number
  dataVersion: number
}

const routeOutcomes: RouteOutcome[] = ['open', 'complete', 'failed'];

export const wayfinderSetup = (easy: boolean): RoundSetup => ({ mode: 'wayfinder', variant: 'map', region: 'world', tier: 'sovereign', deckSize: 10, easy, timed: false });

export const mainlandGraphOf = (places: readonly Place[]): MainlandGraph => new Map(places
  .filter(({ mainlandNeighbours = [] }) => mainlandNeighbours.length > 0)
  .map(({ id, mainlandNeighbours = [] }) => [id, mainlandNeighbours]));

const searchFrom = (graph: MainlandGraph, start: string, usable?: ReadonlySet<string>) => {
  const reached = new Map<string, { steps: number, previous: string | null }>([[start, { steps: 0, previous: null }]]);
  const queue = [start];
  for (const current of queue) {
    for (const next of graph.get(current) ?? []) {
      if (reached.has(next) || (usable && !usable.has(next))) continue;
      reached.set(next, { steps: reached.get(current)!.steps + 1, previous: current });
      queue.push(next);
    }
  }
  return reached;
};

export const shortestLength = (graph: MainlandGraph, start: string, target: string) => {
  const steps = searchFrom(graph, start).get(target)?.steps;
  return steps === undefined ? null : steps - 1;
};

export const linkingRoute = (graph: MainlandGraph, { start, target, entries }: Pick<Route, 'start' | 'target' | 'entries'>) => {
  const reached = searchFrom(graph, start, new Set([target, ...entries]));
  if (!reached.has(target)) return null;
  const chain = [target];
  let { previous } = reached.get(target)!;
  while (previous !== null) {
    chain.unshift(previous);
    ({ previous } = reached.get(previous)!);
  }
  return chain;
};

const pairKeyOf = (first: string, second: string) => [first, second].sort().join('-');

const isMomentOrNull = (value: unknown) => value === null || typeof value === 'number';

export const createWayfinder = ({ places, matcher, random, clock, storage, dataVersion }: WayfinderDependencies) => {
  const graph = mainlandGraphOf(places);
  const placeIds = new Set(places.map(({ id }) => id));

  let phase: 'idle' | WayfinderState['phase'] = 'idle';
  let setup = wayfinderSetup(false);
  let routes: Route[] = [];
  let rejectedEntries: RejectedEntry[] = [];
  let isConfirmingEnd = false;
  let isComplete = true;
  let startedAt = 0;
  let hiddenAt: number | null = null;
  let stoppedMs = 0;
  let elapsedMs = 0;

  const currentRoute = () => routes.at(-1)!;

  const detoursLeft = () => detourBudget - routes.reduce((spent, { detours }) => spent + detours, 0);

  const snapshot = (): WayfinderState | null => {
    if (phase === 'idle') return null;
    if (phase === 'wayfinderResults') return { phase, setup, routes: [...routes], isComplete, elapsedMs };
    return { phase, setup, routeNumber: routes.length, route: currentRoute(), routes: [...routes], detoursLeft: detoursLeft(), rejectedEntries: [...rejectedEntries], isConfirmingEnd };
  };

  let state = snapshot();

  const persist = () => {
    state = snapshot();
    if (phase !== 'wayfinder') {
      storage.removeItem(roundStorageKey);
      return;
    }
    // A round read back on relaunch counts as hidden since its last write, if the app never got to hide it.
    const round: StoredWayfinderRound = { setup, routes, startedAt, hiddenAt: hiddenAt ?? clock(), stoppedMs, dataVersion };
    storage.setItem(roundStorageKey, JSON.stringify(round));
  };

  const drawRoute = (): Route | null => {
    const targetLength = firstTargetLength + targetLengthRise * routes.length;
    const usedPairs = new Set(routes.map(({ start, target }) => pairKeyOf(start, target)));
    let starts = [...graph.keys()];
    while (starts.length > 0) {
      const start = starts[Math.floor(random() * starts.length)]!;
      const candidates = [...searchFrom(graph, start)]
        .map(([target, { steps }]) => ({ target, shortest: steps - 1 }))
        .filter(({ target, shortest }) => shortest >= minimumRouteLength && !usedPairs.has(pairKeyOf(start, target)));
      if (candidates.length > 0) {
        const weights = candidates.map(({ shortest }) => Math.exp(-((shortest - targetLength) ** 2) / (2 * targetLengthSpread ** 2)));
        let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
        let index = 0;
        while (index < candidates.length - 1 && draw >= weights[index]!) draw -= weights[index++]!;
        return { ...candidates[index]!, start, entries: [], detours: 0, outcome: 'open' };
      }
      starts = starts.filter(placeId => placeId !== start);
    }
    return null;
  };

  const playedMs = () => {
    const now = clock();
    return now - startedAt - stoppedMs - (hiddenAt === null ? 0 : now - hiddenAt);
  };

  const finish = () => {
    isConfirmingEnd = false;
    elapsedMs = playedMs();
    phase = 'wayfinderResults';
  };

  const nextRoute = () => {
    const drawn = drawRoute();
    rejectedEntries = [];
    if (!drawn) {
      finish();
      return;
    }
    routes = [...routes, drawn];
    phase = 'wayfinder';
  };

  const start = (roundSetup: RoundSetup) => {
    setup = wayfinderSetup(roundSetup.easy);
    routes = [];
    isConfirmingEnd = false;
    isComplete = true;
    startedAt = clock();
    hiddenAt = null;
    stoppedMs = 0;
    nextRoute();
    persist();
  };

  const rejectionOf = (resolution: Resolution, { start: routeStart, target, entries }: Route): RejectedEntry | null => {
    if (resolution.outcome !== 'match') return { reason: resolution.outcome };
    const { placeId } = resolution;
    if (placeId === routeStart) return { reason: 'start', placeId };
    if (placeId === target) return { reason: 'target', placeId };
    return entries.includes(placeId) ? { reason: 'named', placeId } : null;
  };

  const enter = (placeId: string) => {
    const route = currentRoute();
    const isDetour = route.entries.length >= route.shortest;
    const entries = [...route.entries, placeId];
    const isLinked = linkingRoute(graph, { ...route, entries }) !== null;
    const isOutOfDetours = isDetour && detoursLeft() === 1;
    const outcome: RouteOutcome = isLinked ? 'complete' : isOutOfDetours ? 'failed' : 'open';
    routes = [...routes.slice(0, -1), { ...route, entries, detours: route.detours + (isDetour ? 1 : 0), outcome }];
    rejectedEntries = [];
  };

  const submit = (text: string) => {
    const resolution = matcher.resolve(text);
    const rejection = rejectionOf(resolution, currentRoute());
    if (rejection) rejectedEntries = [...rejectedEntries, rejection];
    else if (resolution.outcome === 'match') enter(resolution.placeId);
  };

  const next = () => (detoursLeft() === 0 ? finish() : nextRoute());

  const end = () => {
    isComplete = false;
    finish();
  };

  const hide = () => {
    hiddenAt ??= clock();
  };

  const show = () => {
    if (hiddenAt !== null) stoppedMs += clock() - hiddenAt;
    hiddenAt = null;
  };

  const send = (event: GameEvent) => {
    const isInRound = phase === 'wayfinder';
    if (event.type === 'hide' && isInRound) hide();
    else if (event.type === 'show' && isInRound) show();
    else if (isInRound && isConfirmingEnd) {
      if (event.type === 'keepPlaying') isConfirmingEnd = false;
      else if (event.type === 'end') end();
      else return;
    }
    else if (event.type === 'askEnd' && isInRound) isConfirmingEnd = true;
    else if (event.type === 'submit' && isInRound && currentRoute().outcome === 'open') submit(event.text);
    else if (event.type === 'next' && isInRound && currentRoute().outcome !== 'open') next();
    else if (event.type === 'leave' && phase === 'wayfinderResults') phase = 'idle';
    else return;
    persist();
  };

  const resumedRouteOf = (stored: Partial<Route> | null) => {
    const { start: routeStart, target, entries, detours, outcome } = stored ?? {};
    if (typeof routeStart !== 'string' || typeof target !== 'string' || !graph.has(routeStart) || !graph.has(target) || routeStart === target) return null;
    const shortest = shortestLength(graph, routeStart, target);
    const isValid = shortest !== null && Array.isArray(entries) && entries.every(placeId => typeof placeId === 'string' && placeIds.has(placeId) && placeId !== routeStart && placeId !== target)
      && new Set(entries).size === entries.length && Number.isInteger(detours) && detours! >= 0 && routeOutcomes.includes(outcome!);
    return isValid ? { start: routeStart, target, shortest, entries, detours: detours!, outcome: outcome! } : null;
  };

  const readStoredRound = (): Partial<StoredWayfinderRound> | null => {
    try {
      return JSON.parse(storage.getItem(roundStorageKey) ?? 'null');
    }
    catch {
      return null;
    }
  };

  const resume = () => {
    const stored = readStoredRound();
    if (stored?.setup?.mode !== 'wayfinder') return false;
    const resumedRoutes = Array.isArray(stored.routes) ? stored.routes.map(resumedRouteOf) : [];
    if (!resumedRoutes.every((route): route is Route => route !== null)) return false;
    const isValid = resumedRoutes.length > 0 && resumedRoutes.slice(0, -1).every(({ outcome }) => outcome !== 'open')
      && resumedRoutes.reduce((spent, { detours }) => spent + detours, 0) <= detourBudget
      && typeof stored.startedAt === 'number' && typeof stored.stoppedMs === 'number' && isMomentOrNull(stored.hiddenAt);
    if (!isValid) return false;
    setup = wayfinderSetup(stored.setup.easy === true);
    routes = resumedRoutes;
    rejectedEntries = [];
    isConfirmingEnd = false;
    isComplete = true;
    startedAt = stored.startedAt!;
    stoppedMs = stored.stoppedMs!;
    // A relaunch is a return from the background.
    hiddenAt = stored.hiddenAt ?? clock();
    show();
    phase = 'wayfinder';
    persist();
    return true;
  };

  return {
    get state() {
      return state;
    },
    start,
    send,
    resume,
  };
};

export type Wayfinder = ReturnType<typeof createWayfinder>;
