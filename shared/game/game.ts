import { berlinDateOf, dailyDeckSize, drawDaily, streakOf } from './daily';
import { createMatcher } from './matcher';
import type { NamesFile } from './matcher';
import { migrateStorage } from './migrations';
import type { SchemaMigration } from './migrations';
import { createRecords } from './records';
import type { DailyCell, DailyRecord, RoundSummary } from './records';

export type Tier = 'sovereign' | 'defacto' | 'dependencies';
export type Region = 'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania';
export type Mode = 'find' | 'name' | 'country';

export type Variant = 'flag' | 'name' | 'both' | 'map' | 'silhouette';
export type DailyVariant = Extract<Variant, 'name' | 'flag'>;
export type DeckSize = 10 | 'all';
export type RegionChoice = Region | 'world';

export interface Place {
  id: string
  tier: Tier
  region: Region
  holder?: string
  flag: string | null
  silhouette?: boolean
}

export interface RoundSetup {
  mode: Mode
  variant: Variant
  region: RegionChoice
  tier: Tier
  deckSize: DeckSize
  easy: boolean
  timed: boolean
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

export interface DataVersion {
  dataVersion: number
  idMoves: Record<string, Record<string, string>>
}

export interface GameDependencies {
  places: readonly Place[]
  names?: NamesFile
  version: DataVersion
  random: () => number
  clock: () => number
  storage: KeyValueStorage
  schemaMigrations?: SchemaMigration[]
}

export type GameEvent
  = | { type: 'start', setup: RoundSetup }
    | { type: 'startDaily', variant: DailyVariant }
    | { type: 'viewDaily' }
    | { type: 'tap', placeId?: string }
    | { type: 'submit', text: string }
    | { type: 'dontKnow' }
    | { type: 'next' }
    | { type: 'tick' }
    | { type: 'askEnd' }
    | { type: 'keepPlaying' }
    | { type: 'end' }
    | { type: 'leave' }
    | { type: 'hide' }
    | { type: 'show' }
    | { type: 'pause' }
    | { type: 'resume' };

export const rightAnswerHoldMs = 1000;
export const rightAnswerFadeMs = 300;
export const rightAnswerAdvanceMs = rightAnswerHoldMs + rightAnswerFadeMs;
export const pausesPerRound = 3;
const tapSkipGuardMs = 150;
const minimumPoolSize = 5;
const easyAttempts = 3;
const promptBudgetsMs: Record<Mode, number> = { find: 8000, name: 15000, country: 15000 };
const typedModes: Mode[] = ['name', 'country'];
const noMapModes: Mode[] = ['country'];
const setupStorageKey = 'ti:setup';
const roundStorageKey = 'ti:round';

export type Outcome = 'right' | 'wrong' | 'missed';
export type ProgressCell = Outcome | 'current' | 'pending';
export type UnresolvedAnswer = 'ambiguous' | 'none';

export type Answer
  = | { placeId: string, tappedPlaceId: string, outcome: 'right' | 'wrong' }
    | { placeId: string, outcome: 'missed' };

interface RoundInPlay {
  setup: RoundSetup
  deckSize: number
  promptNumber: number
  placeId: string
  attemptsLeft: number
  wrongTapPlaceIds: string[]
  unresolvedAnswers: UnresolvedAnswer[]
  score: number
  progress: ProgressCell[]
  isConfirmingEnd: boolean
  isPaused: boolean
  pausesLeft: number
  dailyDate: string | null
}

export type GameState
  = | { phase: 'home' }
    | { phase: 'prompt' } & RoundInPlay
    | { phase: 'verdict', answer: Answer, answeredAt: number } & RoundInPlay
    | { phase: 'results', setup: RoundSetup, deckSize: number, score: number, answers: Answer[], missedPlaceIds: string[], isComplete: boolean, elapsedMs: number, isNewBest: boolean, dailyDate: string | null };

type Phase = GameState['phase'];

const tiersInOrder: Tier[] = ['sovereign', 'defacto', 'dependencies'];
const regionChoices: RegionChoice[] = ['world', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
const deckSizeChoices: DeckSize[] = [10, 'all'];
const modes: Mode[] = ['find', 'name', 'country'];
const variantChoicesByMode: Record<Mode, Variant[]> = { find: ['flag', 'name', 'both'], name: ['map'], country: ['flag'] };
const flagVariants: Variant[] = ['flag', 'both'];
const dailyVariants: DailyVariant[] = ['name', 'flag'];

interface StoredSetups {
  lastMode: Mode
  setups: Partial<Record<Mode, RoundSetup>>
  dailyVariant?: DailyVariant
}

const isInTier = (place: Place, tier: Tier) => tiersInOrder.indexOf(place.tier) <= tiersInOrder.indexOf(tier);

export const isTypedMode = (mode: Mode) => typedModes.includes(mode);

export const isNoMapMode = (mode: Mode) => noMapModes.includes(mode);

const firstTimeSetup = (mode: Mode): RoundSetup => ({ mode, variant: variantChoicesByMode[mode][0]!, region: 'world', tier: 'sovereign', deckSize: 10, easy: false, timed: false });

export const dailySetupOf = (variant: DailyVariant): RoundSetup => ({ mode: 'find', variant, region: 'world', tier: 'sovereign', deckSize: dailyDeckSize, easy: false, timed: false });

const isStoredSetup = (value: unknown, mode: Mode): value is RoundSetup => {
  const stored = value as Partial<RoundSetup> | null;
  return stored?.mode === mode && variantChoicesByMode[mode].includes(stored.variant as Variant)
    && typeof stored.easy === 'boolean' && typeof stored.timed === 'boolean'
    && regionChoices.includes(stored.region as RegionChoice)
    && tiersInOrder.includes(stored.tier as Tier)
    && deckSizeChoices.includes(stored.deckSize as DeckSize);
};

interface StoredRound {
  setup: RoundSetup
  deck: string[]
  promptIndex: number
  answers: Answer[]
  wrongTapPlaceIds: string[]
  startedAt: number
  hiddenAt: number | null
  stoppedMs: number
  pausedAt: number | null
  pausesUsed: number
  dataVersion: number
  dailyDate?: string | null
}

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

const isMomentOrNull = (value: unknown) => value === null || typeof value === 'number';

const isStoredAnswer = (stored: Answer, placeId: string | undefined, placeIds: Set<string>) => stored.placeId === placeId
  && (stored.outcome === 'missed' || ((stored.outcome === 'right' || stored.outcome === 'wrong') && placeIds.has(stored.tappedPlaceId)));

const shuffled = <T>(items: readonly T[], random: () => number) => {
  const deck = [...items];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
  }
  return deck;
};

export const deepestTierPlayed = (storage: KeyValueStorage) => createRecords(storage).roundLog()
  .map(({ tier }) => tier)
  .reduce((deepest, tier) => (tiersInOrder.indexOf(tier) > tiersInOrder.indexOf(deepest) ? tier : deepest), tiersInOrder[0]!);

export const createGame = ({ places, names = {}, version, random, clock, storage, schemaMigrations }: GameDependencies) => {
  migrateStorage(storage, version, schemaMigrations);
  const placeIds = new Set(places.map(({ id }) => id));
  const placesById = new Map(places.map(place => [place.id, place]));
  const records = createRecords(storage);
  const matcher = createMatcher(names);

  let phase: Phase = 'home';
  let setup = firstTimeSetup('find');
  let deck: string[] = [];
  let answers: Answer[] = [];
  let promptIndex = 0;
  let answeredAt = 0;
  let wrongTapPlaceIds: string[] = [];
  let unresolvedAnswers: UnresolvedAnswer[] = [];
  let isConfirmingEnd = false;
  let isComplete = true;
  let startedAt = 0;
  let hiddenAt: number | null = null;
  let stoppedMs = 0;
  let pausedAt: number | null = null;
  let pausesUsed = 0;
  let elapsedMs = 0;
  let isNewBest = false;
  let dailyDate: string | null = null;

  const poolOf = (poolSetup: RoundSetup) => places
    .filter(place => isInTier(place, poolSetup.tier))
    .filter(place => poolSetup.region === 'world' || place.region === poolSetup.region)
    .filter(place => !flagVariants.includes(poolSetup.variant) || place.flag !== null)
    .filter(place => poolSetup.variant !== 'silhouette' || place.silhouette !== false)
    .map(({ id }) => id);

  const poolSizeOf = (poolSetup: RoundSetup) => poolOf(poolSetup).length;

  const choiceOf = <Value>(value: Value, count: number): Choice<Value> => ({ value, count, isAvailable: count >= minimumPoolSize });

  const choicesFor = (chosen: RoundSetup): SetupChoices => {
    const poolSize = poolSizeOf(chosen);
    return {
      variants: variantChoicesByMode[chosen.mode].map(variant => choiceOf(variant, poolSizeOf({ ...chosen, variant }))),
      regions: regionChoices.map(region => choiceOf(region, poolSizeOf({ ...chosen, region }))),
      tiers: tiersInOrder.map(tier => choiceOf(tier, poolSizeOf({ ...chosen, tier }))),
      deckSizes: deckSizeChoices.map(deckSize => choiceOf(deckSize, deckSize === 'all' ? poolSize : Math.min(deckSize, poolSize))),
      playCount: Math.min(chosen.deckSize === 'all' ? poolSize : chosen.deckSize, poolSize),
    };
  };

  const readStoredSetups = (): StoredSetups => {
    try {
      const stored = JSON.parse(storage.getItem(setupStorageKey) ?? 'null') as StoredSetups | null;
      if (stored && modes.includes(stored.lastMode) && stored.setups && typeof stored.setups === 'object') return stored;
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
    const stored = readStoredSetups();
    storage.setItem(setupStorageKey, JSON.stringify({ ...stored, lastMode: rememberedSetup.mode, setups: { ...stored.setups, [rememberedSetup.mode]: rememberedSetup } }));
  };

  const rememberDailyVariant = (variant: DailyVariant) => {
    storage.setItem(setupStorageKey, JSON.stringify({ ...readStoredSetups(), dailyVariant: variant }));
  };

  const rememberedDailyVariant = (): DailyVariant => {
    const remembered = readStoredSetups().dailyVariant;
    return remembered && dailyVariants.includes(remembered) ? remembered : 'name';
  };

  const todaysDaily = (): DailyRecord | undefined => records.dailyRecords()[berlinDateOf(clock())];

  const streak = () => streakOf(new Set(Object.values(records.dailyRecords()).filter(({ complete }) => complete).map(({ date }) => date)), berlinDateOf(clock()));

  const answeredAs = (tappedPlaceId: string) => {
    let tapped = placesById.get(tappedPlaceId)!;
    while (!isInTier(tapped, setup.tier) && tapped.holder && placesById.has(tapped.holder)) tapped = placesById.get(tapped.holder)!;
    return tapped.id;
  };

  const attemptsAllowed = () => (setup.easy ? easyAttempts : 1);

  const pausesLeft = () => (setup.timed ? pausesPerRound - pausesUsed : 0);

  const snapshot = (): GameState => {
    if (phase === 'home') return { phase };
    const score = answers.filter(({ outcome }) => outcome === 'right').length;
    if (phase === 'results') return { phase, setup, deckSize: deck.length, score, answers: [...answers], missedPlaceIds: deck.slice(answers.length), isComplete, elapsedMs, isNewBest, dailyDate };
    const progress = deck.map((_, index): ProgressCell => answers[index]?.outcome ?? (index === promptIndex ? 'current' : 'pending'));
    const roundInPlay = { setup, deckSize: deck.length, promptNumber: promptIndex + 1, placeId: deck[promptIndex]!, attemptsLeft: attemptsAllowed() - wrongTapPlaceIds.length, wrongTapPlaceIds: [...wrongTapPlaceIds], unresolvedAnswers: [...unresolvedAnswers], score, progress, isConfirmingEnd, isPaused: pausedAt !== null, pausesLeft: pausesLeft(), dailyDate };
    return phase === 'verdict' ? { phase, answer: answers[promptIndex]!, answeredAt, ...roundInPlay } : { phase, ...roundInPlay };
  };

  const persistRound = () => {
    if (phase !== 'prompt' && phase !== 'verdict') {
      storage.removeItem(roundStorageKey);
      return;
    }
    // A round read back on relaunch counts as hidden since its last write, if the app never got to hide it.
    const round: StoredRound = { setup, deck, promptIndex, answers, wrongTapPlaceIds, startedAt, hiddenAt: hiddenAt ?? clock(), stoppedMs, pausedAt, pausesUsed, dataVersion: version.dataVersion, dailyDate };
    storage.setItem(roundStorageKey, JSON.stringify(round));
  };

  const resumeStoredRound = () => {
    let stored: Partial<StoredRound> | null = null;
    try {
      stored = JSON.parse(storage.getItem(roundStorageKey) ?? 'null');
    }
    catch {
      // A damaged entry is treated as no round.
    }
    const { deck: storedDeck, answers: storedAnswers, promptIndex: storedIndex, wrongTapPlaceIds: storedWrongTaps } = stored ?? {};
    const isValid = stored !== null && modes.some(mode => isStoredSetup(stored!.setup, mode))
      && isStringList(storedDeck) && new Set(storedDeck).size === storedDeck.length && storedDeck.every(id => placeIds.has(id))
      && Number.isInteger(storedIndex) && storedIndex! >= 0 && storedIndex! < storedDeck.length
      && Array.isArray(storedAnswers) && (storedAnswers.length === storedIndex || storedAnswers.length === storedIndex! + 1)
      && storedAnswers.every((storedAnswer: Answer, index) => isStoredAnswer(storedAnswer, storedDeck[index], placeIds))
      && isStringList(storedWrongTaps) && storedWrongTaps.every(id => placeIds.has(id))
      && typeof stored.startedAt === 'number' && typeof stored.stoppedMs === 'number' && isMomentOrNull(stored.hiddenAt) && isMomentOrNull(stored.pausedAt)
      && Number.isInteger(stored.pausesUsed) && stored.pausesUsed! >= 0 && stored.pausesUsed! <= pausesPerRound;
    if (!isValid) {
      storage.removeItem(roundStorageKey);
      return;
    }
    setup = stored!.setup!;
    deck = storedDeck;
    answers = storedAnswers;
    promptIndex = storedIndex!;
    wrongTapPlaceIds = storedWrongTaps;
    startedAt = stored!.startedAt!;
    stoppedMs = stored!.stoppedMs!;
    hiddenAt = stored!.hiddenAt ?? null;
    pausedAt = stored!.pausedAt ?? null;
    pausesUsed = stored!.pausesUsed!;
    dailyDate = typeof stored!.dailyDate === 'string' ? stored!.dailyDate : null;
    phase = 'prompt';
    // A relaunch is a return from the background.
    hide();
    show();
    if (answers.length > promptIndex) advance();
    if (timeLeftMs() === 0) runOut();
  };

  let state = snapshot();

  const begin = (roundSetup: RoundSetup, roundDeck: string[], roundDailyDate: string | null) => {
    setup = roundSetup;
    deck = roundDeck;
    dailyDate = roundDailyDate;
    answers = [];
    wrongTapPlaceIds = [];
    unresolvedAnswers = [];
    promptIndex = 0;
    isConfirmingEnd = false;
    isComplete = true;
    startedAt = clock();
    hiddenAt = null;
    stoppedMs = 0;
    pausedAt = null;
    pausesUsed = 0;
    phase = 'prompt';
  };

  const start = (roundSetup: RoundSetup) => {
    begin(roundSetup, shuffled(poolOf(roundSetup), random).slice(0, roundSetup.deckSize === 'all' ? undefined : roundSetup.deckSize), null);
    rememberSetup(roundSetup);
  };

  const startDaily = (variant: DailyVariant) => {
    const date = berlinDateOf(clock());
    begin(dailySetupOf(variant), drawDaily(poolOf(dailySetupOf('flag')), date), date);
    records.recordDaily({ date, variant, score: 0, deckSize: deck.length, elapsedMs: 0, complete: false });
    rememberDailyVariant(variant);
  };

  const viewDaily = ({ date, variant, elapsedMs: dailyElapsedMs, complete }: DailyRecord, cells: DailyCell[]) => {
    setup = dailySetupOf(variant);
    deck = drawDaily(poolOf(dailySetupOf('flag')), date);
    answers = cells.flatMap((outcome, index): Answer[] => (outcome === 'missed' ? [] : [{ placeId: deck[index]!, tappedPlaceId: outcome === 'right' ? deck[index]! : '', outcome }]));
    dailyDate = date;
    isComplete = complete;
    elapsedMs = dailyElapsedMs;
    isNewBest = false;
    phase = 'results';
  };

  const settle = (answered: Answer, confusedWith: string | undefined) => {
    answers = [...answers, answered];
    answeredAt = clock();
    phase = 'verdict';
    records.recordAnswer(setup, answered, confusedWith);
  };

  const answer = (tappedPlaceId: string) => {
    const placeId = deck[promptIndex]!;
    const answeredPlaceId = answeredAs(tappedPlaceId);
    if (answeredPlaceId !== placeId && wrongTapPlaceIds.length + 1 < attemptsAllowed()) {
      wrongTapPlaceIds = [...wrongTapPlaceIds, answeredPlaceId];
      return;
    }
    const outcome = answeredPlaceId === placeId ? 'right' : 'wrong';
    settle({ placeId, tappedPlaceId: answeredPlaceId, outcome }, outcome === 'wrong' ? answeredPlaceId : wrongTapPlaceIds.at(-1));
  };

  const submit = (text: string) => {
    const placeId = deck[promptIndex]!;
    const judged = matcher.judge(text, placeId);
    if (judged.verdict === 'ambiguous' || judged.verdict === 'none') {
      unresolvedAnswers = [...unresolvedAnswers, judged.verdict];
      return;
    }
    settle({ placeId, tappedPlaceId: judged.placeId, outcome: judged.verdict === 'correct' ? 'right' : 'wrong' }, judged.verdict === 'wrong' ? judged.placeId : undefined);
  };

  const pause = () => {
    // A pause used by backgrounding starts at the moment the app was hidden.
    pausedAt = hiddenAt ?? clock();
    pausesUsed += 1;
  };

  const hide = () => {
    hiddenAt ??= clock();
    if (pausedAt === null && pausesLeft() > 0) pause();
  };

  const show = () => {
    if (!setup.timed && hiddenAt !== null) stoppedMs += clock() - hiddenAt;
    hiddenAt = null;
  };

  const restartRightAnswerHold = () => {
    if (phase === 'verdict' && answers[promptIndex]!.outcome === 'right') answeredAt = clock();
  };

  const resume = () => {
    stoppedMs += clock() - pausedAt!;
    pausedAt = null;
    restartRightAnswerHold();
  };

  const playedMs = () => {
    const now = clock();
    const stoppedSince = pausedAt ?? (setup.timed ? null : hiddenAt);
    return now - startedAt - stoppedMs - (stoppedSince === null ? 0 : now - stoppedSince);
  };

  const timeLimitMs = () => (setup.timed ? promptBudgetsMs[setup.mode] * deck.length : Infinity);

  const isRoundInPlay = () => phase === 'prompt' || phase === 'verdict';

  const timeLeftMs = () => (isRoundInPlay() && setup.timed ? Math.max(0, timeLimitMs() - playedMs()) : null);

  const finish = () => {
    elapsedMs = Math.min(playedMs(), timeLimitMs());
    const summary: RoundSummary = {
      date: startedAt,
      mode: setup.mode,
      variant: setup.variant,
      region: setup.region,
      tier: setup.tier,
      deckSize: deck.length,
      timed: setup.timed,
      easy: setup.easy,
      daily: dailyDate !== null,
      learn: false,
      score: answers.filter(({ outcome }) => outcome === 'right').length,
      complete: isComplete,
      elapsedMs,
      pausesUsed,
      dataVersion: version.dataVersion,
    };
    records.logRound(summary);
    isNewBest = isComplete && records.recordBest(setup, summary);
    if (dailyDate !== null) records.recordDaily({ date: dailyDate, variant: setup.variant as DailyVariant, score: summary.score, deckSize: summary.deckSize, elapsedMs, complete: isComplete, cells: deck.map((_, index): DailyCell => answers[index]?.outcome ?? 'missed') });
    phase = 'results';
  };

  const isRightAnswerDue = () => answers[promptIndex]?.outcome === 'right' && clock() - answeredAt >= rightAnswerAdvanceMs;

  const advance = () => {
    if (promptIndex + 1 < deck.length) {
      promptIndex += 1;
      wrongTapPlaceIds = [];
      unresolvedAnswers = [];
      phase = 'prompt';
    }
    else {
      finish();
    }
  };

  const keepPlaying = () => {
    isConfirmingEnd = false;
    restartRightAnswerHold();
  };

  const end = () => {
    isConfirmingEnd = false;
    isComplete = false;
    finish();
  };

  const runOut = () => (answers.length < deck.length ? end() : finish());

  const send = (event: GameEvent) => {
    const isInRound = isRoundInPlay();
    if (isInRound && timeLeftMs() === 0) runOut();
    else if (event.type === 'hide' && isInRound) hide();
    else if (event.type === 'show' && isInRound) show();
    else if (isInRound && pausedAt !== null) {
      if (event.type === 'resume') resume();
      else return;
    }
    else if (event.type === 'pause' && isInRound && pausesLeft() > 0) pause();
    else if (isInRound && isConfirmingEnd) {
      if (event.type === 'keepPlaying') keepPlaying();
      else if (event.type === 'end') end();
      else return;
    }
    else if (event.type === 'askEnd' && isInRound) isConfirmingEnd = true;
    else if (event.type === 'start' && (phase === 'home' || phase === 'results') && variantChoicesByMode[event.setup.mode].includes(event.setup.variant) && poolSizeOf(event.setup) >= minimumPoolSize) start(event.setup);
    else if (event.type === 'startDaily' && (phase === 'home' || phase === 'results') && dailyVariants.includes(event.variant) && !todaysDaily()) startDaily(event.variant);
    else if (event.type === 'viewDaily' && phase === 'home' && todaysDaily()?.cells) viewDaily(todaysDaily()!, todaysDaily()!.cells!);
    else if (event.type === 'tap' && phase === 'prompt' && !isTypedMode(setup.mode) && event.placeId !== undefined && placeIds.has(event.placeId)) answer(event.placeId);
    else if (event.type === 'submit' && phase === 'prompt' && isTypedMode(setup.mode)) submit(event.text);
    else if (event.type === 'dontKnow' && phase === 'prompt' && isTypedMode(setup.mode)) settle({ placeId: deck[promptIndex]!, outcome: 'missed' }, undefined);
    else if (event.type === 'tap' && phase === 'verdict' && clock() - answeredAt >= tapSkipGuardMs) advance();
    else if (event.type === 'next' && phase === 'verdict') advance();
    else if (event.type === 'tick' && phase === 'verdict' && isRightAnswerDue()) advance();
    else if (event.type === 'leave' && phase === 'results') phase = 'home';
    else return;
    state = snapshot();
    persistRound();
  };

  resumeStoredRound();
  state = snapshot();
  persistRound();

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
    timeLeftMs,
    dailyVariant: rememberedDailyVariant,
    todaysDaily,
    streak,
    send,
  };
};

export type Game = ReturnType<typeof createGame>;
