export type Tier = 'sovereign' | 'defacto' | 'dependencies';
export type Region = 'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania';
export type Mode = 'find';

export type Variant = 'flag' | 'name' | 'both';
export type DeckSize = 10 | 'all';
export type RegionChoice = Region | 'world';

export interface Place {
  id: string
  tier: Tier
  region: Region
  holder?: string
  flag: string | null
}

export interface RoundSetup {
  mode: Mode
  variant: Variant
  region: RegionChoice
  tier: Tier
  deckSize: DeckSize
  easy: boolean
}

export interface Choice<Value> {
  value: Value
  count: number
  isAvailable: boolean
}

export interface SetupChoices {
  variants: Choice<Variant>[]
  regions: Choice<RegionChoice>[]
  tiers: Choice<Tier>[]
  deckSizes: Choice<DeckSize>[]
  playCount: number
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
    | { type: 'tap', placeId?: string }
    | { type: 'next' }
    | { type: 'tick' }
    | { type: 'leave' };

export const rightAnswerHoldMs = 1000;
export const rightAnswerFadeMs = 300;
export const rightAnswerAdvanceMs = rightAnswerHoldMs + rightAnswerFadeMs;
const tapSkipGuardMs = 150;
const minimumPoolSize = 5;
const easyAttempts = 3;
const setupStorageKey = 'ti:setup';

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
  attemptsLeft: number
  wrongTapPlaceIds: string[]
  score: number
  progress: ProgressCell[]
}

export type GameState
  = | { phase: 'home' }
    | { phase: 'prompt' } & RoundInPlay
    | { phase: 'verdict', answer: Answer, answeredAt: number } & RoundInPlay
    | { phase: 'results', setup: RoundSetup, deckSize: number, score: number, answers: Answer[] };

type Phase = GameState['phase'];

const tiersInOrder: Tier[] = ['sovereign', 'defacto', 'dependencies'];
const regionChoices: RegionChoice[] = ['world', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
const deckSizeChoices: DeckSize[] = [10, 'all'];
const variantChoices: Variant[] = ['flag', 'name', 'both'];

interface StoredSetups {
  lastMode: Mode
  setups: Partial<Record<Mode, RoundSetup>>
}

const isInTier = (place: Place, tier: Tier) => tiersInOrder.indexOf(place.tier) <= tiersInOrder.indexOf(tier);

const firstTimeSetup = (mode: Mode): RoundSetup => ({ mode, variant: 'flag', region: 'world', tier: 'sovereign', deckSize: 10, easy: false });

const isStoredSetup = (value: unknown, mode: Mode): value is RoundSetup => {
  const stored = value as Partial<RoundSetup> | null;
  return stored?.mode === mode && variantChoices.includes(stored.variant as Variant)
    && typeof stored.easy === 'boolean'
    && regionChoices.includes(stored.region as RegionChoice)
    && tiersInOrder.includes(stored.tier as Tier)
    && deckSizeChoices.includes(stored.deckSize as DeckSize);
};

const shuffled = <T>(items: readonly T[], random: () => number) => {
  const deck = [...items];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
  }
  return deck;
};

export const createGame = ({ places, random, clock, storage }: GameDependencies) => {
  const placeIds = new Set(places.map(({ id }) => id));
  const placesById = new Map(places.map(place => [place.id, place]));

  let phase: Phase = 'home';
  let setup = firstTimeSetup('find');
  let deck: string[] = [];
  let answers: Answer[] = [];
  let promptIndex = 0;
  let answeredAt = 0;
  let wrongTapPlaceIds: string[] = [];

  const poolOf = (poolSetup: RoundSetup) => places
    .filter(place => isInTier(place, poolSetup.tier))
    .filter(place => poolSetup.region === 'world' || place.region === poolSetup.region)
    .filter(place => poolSetup.variant === 'name' || place.flag !== null)
    .map(({ id }) => id);

  const poolSizeOf = (poolSetup: RoundSetup) => poolOf(poolSetup).length;

  const choiceOf = <Value>(value: Value, count: number): Choice<Value> => ({ value, count, isAvailable: count >= minimumPoolSize });

  const choicesFor = (chosen: RoundSetup): SetupChoices => {
    const poolSize = poolSizeOf(chosen);
    return {
      variants: variantChoices.map(variant => choiceOf(variant, poolSizeOf({ ...chosen, variant }))),
      regions: regionChoices.map(region => choiceOf(region, poolSizeOf({ ...chosen, region }))),
      tiers: tiersInOrder.map(tier => choiceOf(tier, poolSizeOf({ ...chosen, tier }))),
      deckSizes: deckSizeChoices.map(deckSize => choiceOf(deckSize, deckSize === 'all' ? poolSize : Math.min(deckSize, poolSize))),
      playCount: Math.min(chosen.deckSize === 'all' ? poolSize : chosen.deckSize, poolSize),
    };
  };

  const readStoredSetups = (): StoredSetups => {
    try {
      const stored = JSON.parse(storage.getItem(setupStorageKey) ?? 'null') as StoredSetups | null;
      if (stored?.lastMode === 'find' && stored.setups && typeof stored.setups === 'object') return stored;
    }
    catch {
      // A damaged entry is treated as no memory.
    }
    return { lastMode: 'find', setups: {} };
  };

  const rememberedSetupFor = (mode: Mode) => {
    const remembered = readStoredSetups().setups[mode];
    return isStoredSetup(remembered, mode) ? remembered : firstTimeSetup(mode);
  };

  const rememberSetup = (rememberedSetup: RoundSetup) => {
    const { setups } = readStoredSetups();
    storage.setItem(setupStorageKey, JSON.stringify({ lastMode: rememberedSetup.mode, setups: { ...setups, [rememberedSetup.mode]: rememberedSetup } }));
  };

  const answeredAs = (tappedPlaceId: string) => {
    let tapped = placesById.get(tappedPlaceId)!;
    while (!isInTier(tapped, setup.tier) && tapped.holder && placesById.has(tapped.holder)) tapped = placesById.get(tapped.holder)!;
    return tapped.id;
  };

  const attemptsAllowed = () => (setup.easy ? easyAttempts : 1);

  const snapshot = (): GameState => {
    if (phase === 'home') return { phase };
    const score = answers.filter(({ outcome }) => outcome === 'right').length;
    if (phase === 'results') return { phase, setup, deckSize: deck.length, score, answers: [...answers] };
    const progress = deck.map((_, index): ProgressCell => answers[index]?.outcome ?? (index === promptIndex ? 'current' : 'pending'));
    const roundInPlay = { setup, deckSize: deck.length, promptNumber: promptIndex + 1, placeId: deck[promptIndex]!, attemptsLeft: attemptsAllowed() - wrongTapPlaceIds.length, wrongTapPlaceIds: [...wrongTapPlaceIds], score, progress };
    return phase === 'verdict' ? { phase, answer: answers[promptIndex]!, answeredAt, ...roundInPlay } : { phase, ...roundInPlay };
  };

  let state = snapshot();

  const start = (roundSetup: RoundSetup) => {
    setup = roundSetup;
    deck = shuffled(poolOf(roundSetup), random).slice(0, roundSetup.deckSize === 'all' ? undefined : roundSetup.deckSize);
    answers = [];
    wrongTapPlaceIds = [];
    promptIndex = 0;
    phase = 'prompt';
    rememberSetup(roundSetup);
  };

  const answer = (tappedPlaceId: string) => {
    const placeId = deck[promptIndex]!;
    const answeredPlaceId = answeredAs(tappedPlaceId);
    if (answeredPlaceId !== placeId && wrongTapPlaceIds.length + 1 < attemptsAllowed()) {
      wrongTapPlaceIds = [...wrongTapPlaceIds, answeredPlaceId];
      return;
    }
    answers = [...answers, { placeId, tappedPlaceId: answeredPlaceId, outcome: answeredPlaceId === placeId ? 'right' : 'wrong' }];
    answeredAt = clock();
    phase = 'verdict';
  };

  const isRightAnswerDue = () => answers[promptIndex]?.outcome === 'right' && clock() - answeredAt >= rightAnswerAdvanceMs;

  const advance = () => {
    if (promptIndex + 1 < deck.length) {
      promptIndex += 1;
      wrongTapPlaceIds = [];
      phase = 'prompt';
    }
    else {
      phase = 'results';
    }
  };

  const send = (event: GameEvent) => {
    if (event.type === 'start' && (phase === 'home' || phase === 'results') && poolSizeOf(event.setup) >= minimumPoolSize) start(event.setup);
    else if (event.type === 'tap' && phase === 'prompt' && event.placeId !== undefined && placeIds.has(event.placeId)) answer(event.placeId);
    else if (event.type === 'tap' && phase === 'verdict' && clock() - answeredAt >= tapSkipGuardMs) advance();
    else if (event.type === 'next' && phase === 'verdict') advance();
    else if (event.type === 'tick' && phase === 'verdict' && isRightAnswerDue()) advance();
    else if (event.type === 'leave' && phase === 'results') phase = 'home';
    else return;
    state = snapshot();
  };

  return {
    get state() {
      return state;
    },
    setupFor: rememberedSetupFor,
    lastSetup: () => {
      const { lastMode, setups } = readStoredSetups();
      const remembered = setups[lastMode];
      return isStoredSetup(remembered, lastMode) ? remembered : undefined;
    },
    choicesFor,
    poolOf,
    send,
  };
};

export type Game = ReturnType<typeof createGame>;
