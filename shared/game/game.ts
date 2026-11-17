export type Tier = 'sovereign' | 'defacto' | 'dependencies';
export type Region = 'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania';
export type Mode = 'find';

export interface Place {
  id: string
  tier: Tier
  region: Region
}

export interface RoundSetup {
  mode: Mode
  variant: 'name'
  region: Region | 'world'
  tier: Tier
  deckSize: 10
}

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface GameDependencies {
  places: readonly Place[]
  random: () => number
  clock: () => number
  storage: KeyValueStorage
}

export type GameEvent
  = | { type: 'start', setup: RoundSetup }
    | { type: 'tap', placeId: string }
    | { type: 'next' }
    | { type: 'leave' };

export type Outcome = 'right' | 'wrong';
export type ProgressCell = Outcome | 'current' | 'pending';

export interface Answer {
  placeId: string
  tappedPlaceId: string
  outcome: Outcome
}

interface RoundInPlay {
  setup: RoundSetup
  deckSize: number
  promptNumber: number
  placeId: string
  score: number
  progress: ProgressCell[]
}

export type GameState
  = | { phase: 'home' }
    | { phase: 'prompt' } & RoundInPlay
    | { phase: 'verdict', answer: Answer } & RoundInPlay
    | { phase: 'results', setup: RoundSetup, deckSize: number, score: number, answers: Answer[] };

type Phase = GameState['phase'];

const tiersInOrder: Tier[] = ['sovereign', 'defacto', 'dependencies'];

const isInTier = (place: Place, tier: Tier) => tiersInOrder.indexOf(place.tier) <= tiersInOrder.indexOf(tier);

const firstTimeSetup = (mode: Mode): RoundSetup => ({ mode, variant: 'name', region: 'world', tier: 'sovereign', deckSize: 10 });

const shuffled = <T>(items: readonly T[], random: () => number) => {
  const deck = [...items];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
  }
  return deck;
};

export const createGame = ({ places, random }: GameDependencies) => {
  const placeIds = new Set(places.map(({ id }) => id));

  let phase: Phase = 'home';
  let setup = firstTimeSetup('find');
  let deck: string[] = [];
  let answers: Answer[] = [];
  let promptIndex = 0;

  const poolOf = (poolSetup: RoundSetup) => places
    .filter(place => isInTier(place, poolSetup.tier))
    .filter(place => poolSetup.region === 'world' || place.region === poolSetup.region)
    .map(({ id }) => id);

  const snapshot = (): GameState => {
    if (phase === 'home') return { phase };
    const score = answers.filter(({ outcome }) => outcome === 'right').length;
    if (phase === 'results') return { phase, setup, deckSize: deck.length, score, answers: [...answers] };
    const progress = deck.map((_, index): ProgressCell => answers[index]?.outcome ?? (index === promptIndex ? 'current' : 'pending'));
    const roundInPlay = { setup, deckSize: deck.length, promptNumber: promptIndex + 1, placeId: deck[promptIndex]!, score, progress };
    return phase === 'verdict' ? { phase, answer: answers[promptIndex]!, ...roundInPlay } : { phase, ...roundInPlay };
  };

  let state = snapshot();

  const start = (roundSetup: RoundSetup) => {
    setup = roundSetup;
    deck = shuffled(poolOf(roundSetup), random).slice(0, roundSetup.deckSize);
    answers = [];
    promptIndex = 0;
    phase = 'prompt';
  };

  const answer = (tappedPlaceId: string) => {
    const placeId = deck[promptIndex]!;
    answers = [...answers, { placeId, tappedPlaceId, outcome: tappedPlaceId === placeId ? 'right' : 'wrong' }];
    phase = 'verdict';
  };

  const advance = () => {
    if (promptIndex + 1 < deck.length) {
      promptIndex += 1;
      phase = 'prompt';
    }
    else {
      phase = 'results';
    }
  };

  const send = (event: GameEvent) => {
    if (event.type === 'start' && (phase === 'home' || phase === 'results')) start(event.setup);
    else if (event.type === 'tap' && phase === 'prompt' && placeIds.has(event.placeId)) answer(event.placeId);
    else if (event.type === 'next' && phase === 'verdict') advance();
    else if (event.type === 'leave' && phase === 'results') phase = 'home';
    else return;
    state = snapshot();
  };

  return {
    get state() {
      return state;
    },
    setupFor: firstTimeSetup,
    poolOf,
    send,
  };
};

export type Game = ReturnType<typeof createGame>;
