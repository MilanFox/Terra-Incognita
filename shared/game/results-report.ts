import type { Answer, Outcome, Region } from './game';

export const classicMixUpCount = 3;
export const cellsMaxDeckSize = 10;

export type ReportOutcome = Outcome | 'unreached';
export type MistakeTag = 'new' | 'repeat' | 'classic';

export interface DeckEntry {
  promptNumber: number
  placeId: string
  outcome: ReportOutcome
}

export interface Mistake {
  promptNumber: number
  askedPlaceId: string
  answeredPlaceId: string
  mixUpCount: number
  tag: MistakeTag
}

export interface RegionTally {
  region: Region
  right: number
  wrong: number
  missed: number
  unreached: number
  total: number
  unreachedPlaceIds: string[]
}

export interface ResultsReport {
  deck: DeckEntry[]
  rightCount: number
  wrongCount: number
  missedCount: number
  unreachedPlaceIds: string[]
  mistakes: Mistake[]
  regions: RegionTally[]
}

export interface PlaceStory {
  entry: DeckEntry | null
  mistake: Mistake | null
  answeredInsteadOf: Mistake[]
  region: RegionTally | null
}

interface FinishedRound {
  answers: Answer[]
  missedPlaceIds: string[]
}

// eslint-disable-next-line no-unused-vars
type RegionOf = (placeId: string) => Region | undefined;
// eslint-disable-next-line no-unused-vars
type MixUpCount = (askedPlaceId: string, answeredPlaceId: string) => number;

interface ReportDependencies {
  regionOf: RegionOf
  mixUpCount: MixUpCount
}

export const mistakeTagOf = (mixUps: number): MistakeTag => (mixUps >= classicMixUpCount ? 'classic' : mixUps === 2 ? 'repeat' : 'new');

const isClassic = ({ tag }: Mistake) => tag === 'classic';

const rightShareOf = ({ right, total }: RegionTally) => right / total;

export const resultsReportOf = ({ answers, missedPlaceIds }: FinishedRound, { regionOf, mixUpCount }: ReportDependencies): ResultsReport => {
  const deck: DeckEntry[] = [
    ...answers.map(({ placeId, outcome }, index) => ({ promptNumber: index + 1, placeId, outcome })),
    ...missedPlaceIds.map((placeId, index) => ({ promptNumber: answers.length + index + 1, placeId, outcome: 'unreached' as const })),
  ];
  const mistakesAsAsked = answers.flatMap((answer, index): Mistake[] => {
    if (answer.outcome !== 'wrong' || !answer.tappedPlaceId) return [];
    const mixUps = Math.max(1, mixUpCount(answer.placeId, answer.tappedPlaceId));
    return [{ promptNumber: index + 1, askedPlaceId: answer.placeId, answeredPlaceId: answer.tappedPlaceId, mixUpCount: mixUps, tag: mistakeTagOf(mixUps) }];
  });
  const tallies = new Map<Region, RegionTally>();
  for (const { placeId, outcome } of deck) {
    const region = regionOf(placeId);
    if (!region) continue;
    const tally = tallies.get(region) ?? { region, right: 0, wrong: 0, missed: 0, unreached: 0, total: 0, unreachedPlaceIds: [] };
    tally[outcome] += 1;
    tally.total += 1;
    if (outcome === 'unreached') tally.unreachedPlaceIds.push(placeId);
    tallies.set(region, tally);
  }
  const countOf = (counted: ReportOutcome) => deck.filter(({ outcome }) => outcome === counted).length;
  return {
    deck,
    rightCount: countOf('right'),
    wrongCount: countOf('wrong'),
    missedCount: countOf('missed') + countOf('unreached'),
    unreachedPlaceIds: [...missedPlaceIds],
    mistakes: [
      ...mistakesAsAsked.filter(isClassic).sort((first, second) => second.mixUpCount - first.mixUpCount),
      ...mistakesAsAsked.filter(mistake => !isClassic(mistake)),
    ],
    regions: [...tallies.values()].sort((first, second) => rightShareOf(first) - rightShareOf(second) || second.total - first.total),
  };
};

export const placeStoryOf = (report: ResultsReport, placeId: string, regionOf: RegionOf): PlaceStory => ({
  entry: report.deck.find(entry => entry.placeId === placeId) ?? null,
  mistake: report.mistakes.find(({ askedPlaceId }) => askedPlaceId === placeId) ?? null,
  answeredInsteadOf: report.mistakes.filter(({ answeredPlaceId }) => answeredPlaceId === placeId).sort((first, second) => first.promptNumber - second.promptNumber),
  region: report.regions.find(({ region }) => region === regionOf(placeId)) ?? null,
});
