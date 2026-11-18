import type { Answer, Outcome } from './game';

export const workingSetSize = 4;
const firstComebackAfter = 3;
const secondComebackAfter = 6;
const rightsToClear = 2;

export interface Miss {
  placeId: string
  dueAt: number
  rightsInARow: number
}

export interface LearningLoop {
  toJoin: string[]
  misses: Miss[]
  toReview: string[]
  firstAnswers: Answer[]
  learnedPlaceIds: string[]
  answerCount: number
  previousOutcome: Outcome | null
  everythingLearnedAt: number | null
}

// eslint-disable-next-line no-unused-vars
export type ReviewOrder = (excludedPlaceIds: string[]) => string[];

export const startLoop = (toJoin: string[]): LearningLoop => ({
  toJoin,
  misses: [],
  toReview: [],
  firstAnswers: [],
  learnedPlaceIds: [],
  answerCount: 0,
  previousOutcome: null,
  everythingLearnedAt: toJoin.length === 0 ? 0 : null,
});

export const nextPrompt = (loop: LearningLoop, lastPlaceId: string | undefined, reviewOrder: ReviewOrder): { loop: LearningLoop, placeId: string } => {
  const promptNumber = loop.answerCount + 1;
  const missesByDue = [...loop.misses].sort((first, second) => first.dueAt - second.dueAt);
  const due = missesByDue.find(({ dueAt }) => dueAt <= promptNumber);
  if (due) return { loop, placeId: due.placeId };
  const [joining, ...toJoin] = loop.toJoin;
  if (joining !== undefined && loop.misses.length < workingSetSize) return { loop: { ...loop, toJoin }, placeId: joining };
  if (joining === undefined) {
    const [reviewed, ...toReview] = loop.toReview.length > 0 ? loop.toReview : reviewOrder([...loop.misses.map(({ placeId }) => placeId), ...(lastPlaceId ? [lastPlaceId] : [])]);
    if (reviewed !== undefined) return { loop: { ...loop, toReview }, placeId: reviewed };
  }
  const pulledForward = missesByDue.find(({ placeId }) => placeId !== lastPlaceId) ?? missesByDue[0]!;
  return { loop, placeId: pulledForward.placeId };
};

export const afterAnswer = (loop: LearningLoop, answer: Answer): LearningLoop => {
  const answerCount = loop.answerCount + 1;
  const { placeId, outcome } = answer;
  const miss = loop.misses.find(waiting => waiting.placeId === placeId);
  const otherMisses = loop.misses.filter(waiting => waiting !== miss);
  const isCleared = outcome === 'right' && (!miss || miss.rightsInARow + 1 >= rightsToClear);
  let misses = otherMisses;
  if (outcome !== 'right') misses = [...otherMisses, { placeId, dueAt: answerCount + firstComebackAfter, rightsInARow: 0 }];
  else if (miss && !isCleared) misses = loop.misses.map(waiting => (waiting === miss ? { placeId, dueAt: answerCount + secondComebackAfter, rightsInARow: miss.rightsInARow + 1 } : waiting));
  return {
    ...loop,
    misses,
    answerCount,
    firstAnswers: loop.firstAnswers.some(first => first.placeId === placeId) ? loop.firstAnswers : [...loop.firstAnswers, answer],
    learnedPlaceIds: isCleared && !loop.learnedPlaceIds.includes(placeId) ? [...loop.learnedPlaceIds, placeId] : loop.learnedPlaceIds,
    previousOutcome: outcome,
    everythingLearnedAt: loop.everythingLearnedAt ?? (loop.toJoin.length === 0 && misses.length === 0 ? answerCount : null),
  };
};

export const isFirstAnswerTo = (loop: LearningLoop, placeId: string) => !loop.firstAnswers.some(first => first.placeId === placeId);

const isPlaceIdList = (value: unknown, placeIds: Set<string>): value is string[] => Array.isArray(value) && value.every(id => typeof id === 'string' && placeIds.has(id));

const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

const outcomes: unknown[] = ['right', 'wrong', 'missed'];

export const isStoredLoop = (value: unknown, placeIds: Set<string>): value is LearningLoop => {
  const stored = value as Partial<LearningLoop> | null;
  return typeof stored === 'object' && stored !== null
    && isPlaceIdList(stored.toJoin, placeIds) && isPlaceIdList(stored.toReview, placeIds) && isPlaceIdList(stored.learnedPlaceIds, placeIds)
    && Array.isArray(stored.misses) && stored.misses.every((miss: Miss) => isPlaceIdList([miss?.placeId], placeIds) && isCount(miss.dueAt) && isCount(miss.rightsInARow) && miss.rightsInARow < rightsToClear)
    && Array.isArray(stored.firstAnswers) && stored.firstAnswers.every((first: Answer) => isPlaceIdList([first?.placeId], placeIds) && outcomes.includes(first.outcome))
    && isCount(stored.answerCount)
    && (stored.previousOutcome === null || outcomes.includes(stored.previousOutcome))
    && (stored.everythingLearnedAt === null || isCount(stored.everythingLearnedAt));
};
