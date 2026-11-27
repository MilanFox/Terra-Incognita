import { berlinDateOf, dailyDeckSize, drawDaily, streakOf } from './daily';
import { createCapitalMatcher, createMatcher } from './matcher';
import type { NamesFile } from './matcher';
import { drawGaps, gapCount, isStoredProgress, judgeTap, missingTimeLimitMs, tapBudgetOf } from './missing';
import type { MissingTap } from './missing';
import { fillBudgetPerPlaceMs, isStoredFill, judgeFill } from './fill';
import type { FillInput } from './fill';
import { afterAnswer, dealtAmong, isFirstAnswerTo, isStoredLoop, skippedBeforeReach, nextPrompt, shuffledWithinWindow, startLoop } from './learn';
import type { LearningLoop } from './learn';
import { migrateStorage } from './migrations';
import type { SchemaMigration } from './migrations';
import { createRecords } from './records';
import type { DailyCell, DailyRecord, RoundSummary } from './records';
import { createStats } from './stats';
import type { Rating } from './stats';
import { createWayfinder } from './wayfinder';
import type { WayfinderState } from './wayfinder';

export type Tier = 'sovereign' | 'defacto' | 'dependencies';
export type Region = 'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania';
export type Mode = 'find' | 'name' | 'capital' | 'country' | 'fill' | 'missing' | 'wayfinder';

export type Variant = 'flag' | 'name' | 'both' | 'map' | 'silhouette';
export type DailyVariant = Extract<Variant, 'name' | 'flag'>;
export type DeckSize = 10 | 'all';
export type RoundKind = 'quiz' | 'weak' | 'learn';
export type RegionChoice = Region | 'world';

export interface Place {
  id: string
  tier: Tier
  region: Region
  holder?: string
  flag: string | null
  capitals?: string[]
  silhouette?: boolean
  microstate?: Record<Tier, boolean>
  mainlandNeighbours?: string[]
  ease?: number
}

export interface RoundSetup {
  mode: Mode
  variant: Variant
  region: RegionChoice
  tier: Tier
  deckSize: DeckSize
  easy: boolean
  timed: boolean
  roundKind?: RoundKind
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
  roundKinds: Choice<RoundKind>[]
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
  isWaitingForNext?: () => boolean
}

export type GameEvent
  = | { type: 'start', setup: RoundSetup }
    | { type: 'startDaily', variant: DailyVariant }
    | { type: 'viewDaily' }
    | { type: 'tap', placeId?: string }
    | { type: 'submit', text: string }
    | { type: 'dontKnow' }
    | { type: 'pick', placeId: string }
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
const optionCount = 4;
const promptBudgetsMs: Partial<Record<Mode, number>> = { find: 8000, name: 15000, capital: 15000, country: 15000, fill: fillBudgetPerPlaceMs, missing: missingTimeLimitMs / gapCount };
const typedModes: Mode[] = ['name', 'capital', 'country'];
const noMapModes: Mode[] = ['country'];
const regularModes: Mode[] = ['find', 'name', 'capital', 'country'];
const roundKinds: RoundKind[] = ['quiz', 'weak', 'learn'];
const microstatesLastModes: Mode[] = ['find', 'name'];
const setupStorageKey = 'ti:setup';
const roundStorageKey = 'ti:round';

type WeakPlaceIdsByScope = Map<string, Set<string>>;

export type Outcome = 'right' | 'wrong' | 'missed';
export type ProgressCell = Outcome | 'current' | 'pending';
export type UnresolvedAnswer = 'ambiguous' | 'none';

export type Answer
  = | { placeId: string, tappedPlaceId: string, outcome: 'right' | 'wrong' }
    | { placeId: string, outcome: 'missed' };

export interface LearningProgress {
  learnedCount: number
  isEverythingLearned: boolean
  previousOutcome: Outcome | null
}

export interface LearningResults {
  learnedCount: number
  answerCount: number
}

interface RoundInPlay {
  setup: RoundSetup
  deckSize: number
  promptNumber: number
  placeId: string
  attemptsLeft: number
  wrongTapPlaceIds: string[]
  unresolvedAnswers: UnresolvedAnswer[]
  optionPlaceIds: string[]
  score: number
  progress: ProgressCell[]
  isConfirmingEnd: boolean
  isPaused: boolean
  pausesLeft: number
  dailyDate: string | null
  learning?: LearningProgress
}

export type GameState
  = | { phase: 'home' }
    | { phase: 'prompt' } & RoundInPlay
    | { phase: 'verdict', answer: Answer, answeredAt: number } & RoundInPlay
    | { phase: 'fill', setup: RoundSetup, deckSize: number, score: number, filledPlaceIds: string[], filledLandPlaceIds: string[], lastInput: FillInput | null, inputCount: number, isConfirmingEnd: boolean, isPaused: boolean, pausesLeft: number }
    | { phase: 'missing', setup: RoundSetup, gapPlaceIds: string[], foundPlaceIds: string[], tapsLeft: number, lastTap: MissingTap | null, isConfirmingEnd: boolean, isPaused: boolean, pausesLeft: number }
    | { phase: 'results', setup: RoundSetup, deckSize: number, score: number, answers: Answer[], missedPlaceIds: string[], wrongTapCount?: number, isComplete: boolean, elapsedMs: number, isNewBest: boolean, dailyDate: string | null, learning?: LearningResults }
    | WayfinderState;

type Phase = Exclude<GameState, WayfinderState>['phase'];

const tiersInOrder: Tier[] = ['sovereign', 'defacto', 'dependencies'];
const regionChoices: RegionChoice[] = ['world', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
const deckSizeChoices: DeckSize[] = [10, 'all'];
const modes: Mode[] = ['find', 'name', 'capital', 'country', 'fill', 'missing', 'wayfinder'];
export const variantChoicesByMode: Record<Mode, Variant[]> = { find: ['flag', 'name', 'both'], name: ['map'], capital: ['map'], country: ['flag', 'silhouette'], fill: ['map'], missing: ['map'], wayfinder: ['map'] };
const flagVariants: Variant[] = ['flag', 'both'];

export const isEligibleFor = (place: Place, { mode, variant }: { mode: Mode, variant: Variant }) => (!flagVariants.includes(variant) || place.flag !== null)
  && (mode !== 'capital' || (place.capitals?.length ?? 0) > 0)
  && (variant !== 'silhouette' || place.silhouette !== false);
const dailyVariants: DailyVariant[] = ['name', 'flag'];

interface StoredSetups {
  lastMode: Mode
  setups: Partial<Record<Mode, RoundSetup>>
  dailyVariant?: DailyVariant
}

const isInTier = (place: Place, tier: Tier) => tiersInOrder.indexOf(place.tier) <= tiersInOrder.indexOf(tier);

export const isTypedMode = (mode: Mode) => typedModes.includes(mode);

const isMultipleChoice = ({ mode, easy }: RoundSetup) => easy && isTypedMode(mode);
export const isNoMapMode = (mode: Mode) => noMapModes.includes(mode);

export const isLearnSetup = ({ mode, roundKind }: RoundSetup) => roundKind === 'learn' && regularModes.includes(mode);

const firstTimeSetup = (mode: Mode): RoundSetup => ({ mode, variant: variantChoicesByMode[mode][0]!, region: 'world', tier: 'sovereign', deckSize: mode === 'fill' ? 'all' : 10, easy: false, timed: mode === 'missing' });

export const dailySetupOf = (variant: DailyVariant): RoundSetup => ({ mode: 'find', variant, region: 'world', tier: 'sovereign', deckSize: dailyDeckSize, easy: false, timed: false });

const isStoredSetup = (value: unknown, mode: Mode): value is RoundSetup => {
  const stored = value as Partial<RoundSetup> | null;
  return stored?.mode === mode && variantChoicesByMode[mode].includes(stored.variant as Variant)
    && typeof stored.easy === 'boolean' && typeof stored.timed === 'boolean'
    && regionChoices.includes(stored.region as RegionChoice)
    && tiersInOrder.includes(stored.tier as Tier)
    && deckSizeChoices.includes(stored.deckSize as DeckSize)
    && (stored.roundKind === undefined || roundKinds.includes(stored.roundKind));
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
  optionPlaceIds?: string[]
  dataVersion: number
  dailyDate?: string | null
  foundPlaceIds?: string[]
  tapsUsed?: number
  learning?: LearningLoop
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

export const createGame = ({ places, names = {}, version, random, clock, storage, schemaMigrations, isWaitingForNext = () => false }: GameDependencies) => {
  migrateStorage(storage, version, schemaMigrations);
  const placeIds = new Set(places.map(({ id }) => id));
  const placesById = new Map(places.map(place => [place.id, place]));
  const records = createRecords(storage);
  const matcher = createMatcher(names);
  const capitalMatcher = createCapitalMatcher(names, places);
  const wayfinder = createWayfinder({ places, matcher, random, clock, storage, dataVersion: version.dataVersion });

  let phase: Phase = 'home';
  let setup = firstTimeSetup('find');
  let deck: string[] = [];
  let answers: Answer[] = [];
  let promptIndex = 0;
  let answeredAt = 0;
  let wrongTapPlaceIds: string[] = [];
  let unresolvedAnswers: UnresolvedAnswer[] = [];
  let optionPlaceIds: string[] = [];
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
  let foundPlaceIds: string[] = [];
  let tapsUsed = 0;
  let lastTap: MissingTap | null = null;
  let lastFillInput: FillInput | null = null;
  let fillInputCount = 0;
  let learningLoop: LearningLoop | null = null;

  const stats = createStats({ places, storage });

  const weakPlaceIdsOf = ({ mode, variant }: RoundSetup) => new Set(Object.entries(stats.placeRatings({ mode, variant }))
    .filter(([, rating]) => rating === 'weak' || rating === 'shaky')
    .map(([placeId]) => placeId));

  const isInWeakPool = (poolSetup: RoundSetup, weakPlaceIdsByScope: WeakPlaceIdsByScope) => {
    if (poolSetup.roundKind !== 'weak' || !regularModes.includes(poolSetup.mode)) return () => true;
    const scope = `${poolSetup.mode}:${poolSetup.variant}`;
    const weakPlaceIds = weakPlaceIdsByScope.get(scope) ?? weakPlaceIdsOf(poolSetup);
    weakPlaceIdsByScope.set(scope, weakPlaceIds);
    return ({ id }: Place) => weakPlaceIds.has(id);
  };

  const poolOf = (poolSetup: RoundSetup, weakPlaceIdsByScope: WeakPlaceIdsByScope = new Map()) => places
    .filter(place => isInTier(place, poolSetup.tier))
    .filter(place => poolSetup.region === 'world' || place.region === poolSetup.region)
    .filter(place => isEligibleFor(place, poolSetup))
    .filter(place => poolSetup.mode !== 'missing' || !place.microstate?.[poolSetup.tier])
    .filter(isInWeakPool(poolSetup, weakPlaceIdsByScope))
    .map(({ id }) => id);

  const poolSizeOf = (poolSetup: RoundSetup, weakPlaceIdsByScope?: WeakPlaceIdsByScope) => poolOf(poolSetup, weakPlaceIdsByScope).length;

  const inEaseOrder = (learnSetup: RoundSetup, unordered: string[]) => {
    const goesLast = ({ microstate }: Place) => microstatesLastModes.includes(learnSetup.mode) && !!microstate?.[learnSetup.tier];
    return unordered.map(id => placesById.get(id)!)
      .sort((first, second) => Number(goesLast(first)) - Number(goesLast(second)) || (first.ease ?? Infinity) - (second.ease ?? Infinity))
      .map(({ id }) => id);
  };

  const startingLoopOf = (learnSetup: RoundSetup) => {
    const ratings = stats.placeRatings({ mode: learnSetup.mode, variant: learnSetup.variant });
    const placeRecords = records.placeRecordsOf(learnSetup);
    const byEase = inEaseOrder(learnSetup, poolOf(learnSetup));
    const skipped = skippedBeforeReach(byEase, stats.sameKnowledgeAnswers(learnSetup));
    const ratedAs = (...wanted: Rating[]) => byEase.filter(id => wanted.includes(ratings[id] ?? 'noData'));
    const isShakyOnlyByCount = (placeId: string) => ratings[placeId] === 'shaky' && !placeRecords[placeId]?.recent.includes(0);
    const isSkipped = (placeId: string) => skipped.includes(placeId);
    const newPlaces = ratedAs('noData');
    const pastMisses = shuffledWithinWindow(ratedAs('weak', 'shaky').filter(id => !isShakyOnlyByCount(id)), random);
    const toJoin = [...dealtAmong(pastMisses, shuffledWithinWindow(newPlaces.filter(id => !isSkipped(id)), random), random), ...byEase.filter(isShakyOnlyByCount)];
    return startLoop(toJoin, newPlaces.filter(isSkipped));
  };

  const reviewOrderOf = (learnSetup: RoundSetup) => (excludedPlaceIds: string[]) => {
    const ratings = stats.placeRatings({ mode: learnSetup.mode, variant: learnSetup.variant });
    const placeRecords = records.placeRecordsOf(learnSetup);
    const recentShareOf = (placeId: string) => {
      const recent = placeRecords[placeId]?.recent ?? [];
      return recent.length === 0 ? 0 : recent.filter(answer => answer === 1).length / recent.length;
    };
    const candidates = inEaseOrder(learnSetup, poolOf(learnSetup).filter(id => !excludedPlaceIds.includes(id)));
    const solid = candidates.filter(id => ratings[id] === 'solid');
    return (solid.length > 0 ? solid : candidates).sort((first, second) => recentShareOf(first) - recentShareOf(second));
  };

  const choiceOf = <Value>(value: Value, count: number): Choice<Value> => ({ value, count, isAvailable: count >= minimumPoolSize });

  const choicesFor = (chosen: RoundSetup): SetupChoices => {
    const weakPlaceIdsByScope: WeakPlaceIdsByScope = new Map();
    const sizeOf = (poolSetup: RoundSetup) => poolSizeOf(poolSetup, weakPlaceIdsByScope);
    const poolSize = sizeOf(chosen);
    return {
      variants: variantChoicesByMode[chosen.mode].map(variant => choiceOf(variant, sizeOf({ ...chosen, variant }))),
      regions: regionChoices.map(region => choiceOf(region, sizeOf({ ...chosen, region }))),
      tiers: tiersInOrder.map(tier => choiceOf(tier, sizeOf({ ...chosen, tier }))),
      deckSizes: deckSizeChoices.map(deckSize => choiceOf(deckSize, deckSize === 'all' ? poolSize : Math.min(deckSize, poolSize))),
      roundKinds: roundKinds.map(roundKind => choiceOf(roundKind, sizeOf({ ...chosen, roundKind }))),
      playCount: Math.min(chosen.mode === 'missing' ? gapCount : chosen.deckSize === 'all' || isLearnSetup(chosen) ? poolSize : chosen.deckSize, poolSize),
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
    if (!isStoredSetup(remembered, mode)) return firstTimeSetup(mode);
    return remembered.roundKind === 'weak' && poolSizeOf(remembered) < minimumPoolSize ? { ...remembered, roundKind: 'quiz' as const } : remembered;
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

  const optionsFor = (placeId: string) => {
    if (!isMultipleChoice(setup)) return [];
    const others = poolOf(setup).filter(id => id !== placeId);
    const { region } = placesById.get(placeId)!;
    const sameRegion = shuffled(others.filter(id => placesById.get(id)!.region === region), random);
    const otherRegions = shuffled(others.filter(id => placesById.get(id)!.region !== region), random);
    return shuffled([placeId, ...[...sameRegion, ...otherRegions].slice(0, optionCount - 1)], random);
  };

  const attemptsAllowed = () => (setup.easy && !isTypedMode(setup.mode) ? easyAttempts : 1);

  const pausesLeft = () => (setup.timed ? pausesPerRound - pausesUsed : 0);

  const scoreNow = () => (setup.mode === 'missing' ? foundPlaceIds.length : (learningLoop?.firstAnswers ?? answers).filter(({ outcome }) => outcome === 'right').length);

  const gapResults = (): Answer[] => foundPlaceIds.map(placeId => ({ placeId, tappedPlaceId: placeId, outcome: 'right' }));

  const filledLandPlaceIds = () => places.filter(({ id }) => answers.some(({ placeId }) => placeId === answeredAs(id))).map(({ id }) => id);

  const missedPlaceIdsOf = () => {
    if (learningLoop) return [];
    if (setup.mode === 'missing') return deck.filter(id => !foundPlaceIds.includes(id));
    if (setup.mode === 'fill') return deck.filter(id => !answers.some(({ placeId }) => placeId === id));
    return deck.slice(answers.length);
  };

  const snapshot = (): GameState => {
    if (phase === 'home') return { phase };
    const score = scoreNow();
    if (phase === 'fill') return { phase, setup, deckSize: deck.length, score, filledPlaceIds: answers.map(({ placeId }) => placeId), filledLandPlaceIds: filledLandPlaceIds(), lastInput: lastFillInput, inputCount: fillInputCount, isConfirmingEnd, isPaused: pausedAt !== null, pausesLeft: pausesLeft() };
    if (phase === 'missing') return { phase, setup, gapPlaceIds: [...deck], foundPlaceIds: [...foundPlaceIds], tapsLeft: tapBudgetOf(setup.easy) - tapsUsed, lastTap, isConfirmingEnd, isPaused: pausedAt !== null, pausesLeft: pausesLeft() };
    if (phase === 'results' && learningLoop) {
      const { firstAnswers, learnedPlaceIds, answerCount } = learningLoop;
      return { phase, setup, deckSize: firstAnswers.length, score, answers: [...firstAnswers], missedPlaceIds: [], isComplete, elapsedMs, isNewBest, dailyDate, learning: { learnedCount: learnedPlaceIds.length, answerCount } };
    }
    if (phase === 'results') return { phase, setup, deckSize: deck.length, score, answers: setup.mode === 'missing' ? gapResults() : [...answers], missedPlaceIds: missedPlaceIdsOf(), ...(setup.mode === 'missing' && { wrongTapCount: tapsUsed - foundPlaceIds.length }), isComplete, elapsedMs, isNewBest, dailyDate };
    const progress = deck.map((_, index): ProgressCell => answers[index]?.outcome ?? (index === promptIndex ? 'current' : 'pending'));
    const promptNumber = learningLoop ? learningLoop.answerCount - answers.length + 1 : promptIndex + 1;
    const learning = learningLoop && { learnedCount: learningLoop.learnedPlaceIds.length, isEverythingLearned: learningLoop.everythingLearnedAt === promptNumber - 1, previousOutcome: learningLoop.previousOutcome };
    const roundInPlay = { setup, deckSize: deck.length, promptNumber, placeId: deck[promptIndex]!, attemptsLeft: attemptsAllowed() - wrongTapPlaceIds.length, wrongTapPlaceIds: [...wrongTapPlaceIds], unresolvedAnswers: [...unresolvedAnswers], optionPlaceIds: [...optionPlaceIds], score, progress, isConfirmingEnd, isPaused: pausedAt !== null, pausesLeft: pausesLeft(), dailyDate, ...(learning && { learning }) };
    return phase === 'verdict' ? { phase, answer: answers[promptIndex]!, answeredAt, ...roundInPlay } : { phase, ...roundInPlay };
  };

  const persistRound = () => {
    if (!isRoundInPlay()) {
      storage.removeItem(roundStorageKey);
      return;
    }
    // A round read back on relaunch counts as hidden since its last write, if the app never got to hide it.
    const round: StoredRound = { setup, deck, promptIndex, answers, wrongTapPlaceIds, startedAt, hiddenAt: hiddenAt ?? clock(), stoppedMs, pausedAt, pausesUsed, optionPlaceIds, dataVersion: version.dataVersion, dailyDate, foundPlaceIds, tapsUsed, ...(learningLoop && { learning: learningLoop }) };
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
      && Array.isArray(storedAnswers)
      && (stored.setup!.mode === 'fill'
        ? isStoredFill(storedAnswers, storedDeck, storedIndex!)
        : (storedAnswers.length === storedIndex || storedAnswers.length === storedIndex! + 1) && storedAnswers.every((storedAnswer: Answer, index) => isStoredAnswer(storedAnswer, storedDeck[index], placeIds)))
      && isStringList(storedWrongTaps) && storedWrongTaps.every(id => placeIds.has(id))
      && typeof stored.startedAt === 'number' && typeof stored.stoppedMs === 'number' && isMomentOrNull(stored.hiddenAt) && isMomentOrNull(stored.pausedAt)
      && Number.isInteger(stored.pausesUsed) && stored.pausesUsed! >= 0 && stored.pausesUsed! <= pausesPerRound
      && (stored.setup!.mode !== 'missing' || isStoredProgress({ gapPlaceIds: storedDeck, foundPlaceIds: stored.foundPlaceIds, tapsUsed: stored.tapsUsed, easy: stored.setup!.easy }))
      && (!isLearnSetup(stored.setup!) || (storedDeck.length === 1 && isStoredLoop(stored.learning, placeIds)));
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
    foundPlaceIds = setup.mode === 'missing' ? stored!.foundPlaceIds! : [];
    tapsUsed = setup.mode === 'missing' ? stored!.tapsUsed! : 0;
    learningLoop = isLearnSetup(setup) ? stored!.learning! : null;
    lastTap = null;
    optionPlaceIds = isStringList(stored!.optionPlaceIds) && stored!.optionPlaceIds.every(id => placeIds.has(id)) ? stored!.optionPlaceIds : optionsFor(deck[promptIndex]!);
    phase = setup.mode === 'missing' ? 'missing' : setup.mode === 'fill' ? 'fill' : 'prompt';
    // A relaunch is a return from the background.
    hide();
    show();
    if (setup.mode !== 'fill' && answers.length > promptIndex) advance();
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
    optionPlaceIds = optionsFor(deck[0]!);
    foundPlaceIds = [];
    tapsUsed = 0;
    lastTap = null;
    isConfirmingEnd = false;
    isComplete = true;
    startedAt = clock();
    hiddenAt = null;
    stoppedMs = 0;
    pausedAt = null;
    pausesUsed = 0;
    lastFillInput = null;
    fillInputCount = 0;
    learningLoop = null;
    phase = roundSetup.mode === 'missing' ? 'missing' : roundSetup.mode === 'fill' ? 'fill' : 'prompt';
  };

  const startLearning = (requestedSetup: RoundSetup) => {
    const roundSetup: RoundSetup = { ...requestedSetup, timed: false };
    const { loop, placeId } = nextPrompt(startingLoopOf(roundSetup), undefined, reviewOrderOf(roundSetup));
    begin(roundSetup, [placeId], null);
    learningLoop = loop;
    rememberSetup(roundSetup);
  };

  const start = (requestedSetup: RoundSetup) => {
    if (isLearnSetup(requestedSetup)) {
      startLearning(requestedSetup);
      return;
    }
    const roundSetup: RoundSetup = requestedSetup.mode === 'fill' ? { ...requestedSetup, easy: false, deckSize: 'all' } : requestedSetup;
    const roundDeck = roundSetup.mode === 'missing' ? drawGaps(poolOf(roundSetup), random) : roundSetup.mode === 'fill' ? poolOf(roundSetup) : shuffled(poolOf(roundSetup), random).slice(0, roundSetup.deckSize === 'all' ? undefined : roundSetup.deckSize);
    begin(roundSetup, roundDeck, null);
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
    learningLoop = null;
    phase = 'results';
  };

  const settle = (answered: Answer, confusedWith: string | undefined) => {
    answers = [...answers, answered];
    answeredAt = clock();
    phase = 'verdict';
    if (learningLoop && !isFirstAnswerTo(learningLoop, answered.placeId)) records.recordConfusion(setup, answered.placeId, confusedWith);
    else records.recordAnswer(setup, answered, confusedWith);
    if (learningLoop) learningLoop = afterAnswer(learningLoop, answered, random);
  };

  const answer = (tappedPlaceId: string) => {
    const placeId = deck[promptIndex]!;
    const answeredPlaceId = answeredAs(tappedPlaceId);
    if (answeredPlaceId !== placeId && wrongTapPlaceIds.length + 1 < attemptsAllowed()) {
      wrongTapPlaceIds = [...wrongTapPlaceIds, answeredPlaceId];
      records.recordConfusion(setup, placeId, answeredPlaceId);
      return;
    }
    const outcome = answeredPlaceId === placeId ? 'right' : 'wrong';
    settle({ placeId, tappedPlaceId: answeredPlaceId, outcome }, outcome === 'wrong' ? answeredPlaceId : undefined);
  };

  const submit = (text: string) => {
    const placeId = deck[promptIndex]!;
    const judged = (setup.mode === 'capital' ? capitalMatcher : matcher).judge(text, placeId);
    if (judged.verdict === 'ambiguous' || judged.verdict === 'none') {
      unresolvedAnswers = [...unresolvedAnswers, judged.verdict];
      return;
    }
    settle({ placeId, tappedPlaceId: judged.placeId, outcome: judged.verdict === 'correct' ? 'right' : 'wrong' }, judged.verdict === 'wrong' ? judged.placeId : undefined);
  };

  const submitFill = (text: string) => {
    lastFillInput = judgeFill(matcher.resolve(text), deck, answers.map(({ placeId }) => placeId));
    fillInputCount += 1;
    if (lastFillInput.kind !== 'filled') return;
    answers = [...answers, { placeId: lastFillInput.placeId, tappedPlaceId: lastFillInput.placeId, outcome: 'right' }];
    if (answers.length === deck.length) finish();
  };

  const pick = (pickedPlaceId: string) => {
    const placeId = deck[promptIndex]!;
    const isRight = pickedPlaceId === placeId;
    settle({ placeId, tappedPlaceId: pickedPlaceId, outcome: isRight ? 'right' : 'wrong' }, isRight ? undefined : pickedPlaceId);
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

  const timeLimitMs = () => (setup.timed ? promptBudgetsMs[setup.mode]! * deck.length : Infinity);

  const isRoundInPlay = () => phase === 'prompt' || phase === 'verdict' || phase === 'fill' || phase === 'missing';

  const timeLeftMs = () => (isRoundInPlay() && setup.timed ? Math.max(0, timeLimitMs() - playedMs()) : null);

  const finish = () => {
    elapsedMs = Math.min(playedMs(), timeLimitMs());
    const summary: RoundSummary = {
      date: startedAt,
      mode: setup.mode,
      variant: setup.variant,
      region: setup.region,
      tier: setup.tier,
      deckSize: learningLoop?.firstAnswers.length ?? deck.length,
      timed: setup.timed,
      easy: setup.easy,
      daily: dailyDate !== null,
      learn: learningLoop !== null,
      score: scoreNow(),
      complete: isComplete,
      elapsedMs,
      pausesUsed,
      dataVersion: version.dataVersion,
    };
    records.logRound(summary);
    isNewBest = isComplete && !learningLoop && records.recordBest(setup, summary);
    if (dailyDate !== null) records.recordDaily({ date: dailyDate, variant: setup.variant as DailyVariant, score: summary.score, deckSize: summary.deckSize, elapsedMs, complete: isComplete, cells: deck.map((_, index): DailyCell => answers[index]?.outcome ?? 'missed') });
    phase = 'results';
  };

  const isRightAnswerDue = () => answers[promptIndex]?.outcome === 'right' && !isWaitingForNext() && clock() - answeredAt >= rightAnswerAdvanceMs;

  const askNextLearningPrompt = (loop: LearningLoop) => {
    const next = nextPrompt(loop, deck[promptIndex], reviewOrderOf(setup));
    learningLoop = next.loop;
    deck = [next.placeId];
    answers = [];
    promptIndex = 0;
  };

  const advance = () => {
    if (learningLoop || promptIndex + 1 < deck.length) {
      if (learningLoop) askNextLearningPrompt(learningLoop);
      else promptIndex += 1;
      wrongTapPlaceIds = [];
      unresolvedAnswers = [];
      optionPlaceIds = optionsFor(deck[promptIndex]!);
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

  const runOut = () => (setup.mode !== 'missing' && setup.mode !== 'fill' && answers.length < deck.length ? end() : finish());

  const tapGap = (tappedPlaceId: string | undefined) => {
    if (tappedPlaceId !== undefined && !placeIds.has(tappedPlaceId)) return;
    const tap = judgeTap(deck, foundPlaceIds, tappedPlaceId === undefined ? undefined : answeredAs(tappedPlaceId));
    if (!tap) return;
    tapsUsed += 1;
    lastTap = tap;
    if (tap.kind === 'hit') foundPlaceIds = [...foundPlaceIds, tap.placeId];
    if (foundPlaceIds.length === deck.length || tapsUsed >= tapBudgetOf(setup.easy)) finish();
  };

  const sendToWayfinder = (event: GameEvent) => {
    if (wayfinder.state?.phase === 'wayfinderResults' && (event.type === 'start' || event.type === 'startDaily')) wayfinder.send({ type: 'leave' });
    if (wayfinder.state) {
      wayfinder.send(event);
      return true;
    }
    if (event.type !== 'start' || event.setup.mode !== 'wayfinder') return false;
    if (phase === 'home' || phase === 'results') {
      phase = 'home';
      state = snapshot();
      wayfinder.start(event.setup);
      rememberSetup(wayfinder.state!.setup);
    }
    return true;
  };

  const send = (event: GameEvent) => {
    if (sendToWayfinder(event)) return;
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
    else if (event.type === 'askEnd' && isInRound && learningLoop) finish();
    else if (event.type === 'askEnd' && isInRound) isConfirmingEnd = true;
    else if (event.type === 'tap' && phase === 'missing') tapGap(event.placeId);
    else if (event.type === 'start' && (phase === 'home' || phase === 'results') && variantChoicesByMode[event.setup.mode].includes(event.setup.variant) && (event.setup.mode !== 'missing' || event.setup.region === 'world') && poolSizeOf(event.setup) >= minimumPoolSize) start(event.setup);
    else if (event.type === 'startDaily' && (phase === 'home' || phase === 'results') && dailyVariants.includes(event.variant) && !todaysDaily()) startDaily(event.variant);
    else if (event.type === 'viewDaily' && phase === 'home' && todaysDaily()?.cells) viewDaily(todaysDaily()!, todaysDaily()!.cells!);
    else if (event.type === 'tap' && phase === 'prompt' && !isTypedMode(setup.mode) && event.placeId !== undefined && placeIds.has(event.placeId)) answer(event.placeId);
    else if (event.type === 'submit' && phase === 'fill') submitFill(event.text);
    else if (event.type === 'submit' && phase === 'prompt' && isTypedMode(setup.mode) && !setup.easy) submit(event.text);
    else if (event.type === 'pick' && phase === 'prompt' && isMultipleChoice(setup) && optionPlaceIds.includes(event.placeId)) pick(event.placeId);
    else if (event.type === 'dontKnow' && phase === 'prompt' && isTypedMode(setup.mode)) settle({ placeId: deck[promptIndex]!, outcome: 'missed' }, undefined);
    else if (event.type === 'tap' && phase === 'verdict' && clock() - answeredAt >= tapSkipGuardMs) advance();
    else if (event.type === 'next' && phase === 'verdict') advance();
    else if (event.type === 'tick' && phase === 'verdict' && isRightAnswerDue()) advance();
    else if (event.type === 'leave' && phase === 'results') phase = 'home';
    else return;
    state = snapshot();
    persistRound();
  };

  if (!wayfinder.resume()) {
    resumeStoredRound();
    state = snapshot();
    persistRound();
  }

  return {
    get state() {
      return wayfinder.state ?? state;
    },
    setupFor: rememberedSetupFor,
    lastSetup: () => {
      const { lastMode, setups } = readStoredSetups();
      const remembered = setups[lastMode];
      return isStoredSetup(remembered, lastMode) ? remembered : undefined;
    },
    choicesFor,
    poolOf,
    capitalsOf: (placeId: string) => placesById.get(placeId)?.capitals ?? [],
    timeLeftMs,
    dailyVariant: rememberedDailyVariant,
    todaysDaily,
    streak,
    send,
  };
};

export type Game = ReturnType<typeof createGame>;
