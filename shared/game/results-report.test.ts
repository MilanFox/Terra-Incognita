import { describe, expect, it } from 'vitest';
import type { Answer, Region } from './game';
import { mistakeTagOf, placeStoryOf, resultsReportOf } from './results-report';

const regions: Record<string, Region> = { NER: 'Africa', NGA: 'Africa', TCD: 'Africa', MLI: 'Africa', SVK: 'Europe', SVN: 'Europe', AUT: 'Europe', AUS: 'Oceania', FJI: 'Oceania', PER: 'South America' };
const regionOf = (placeId: string) => regions[placeId];

const right = (placeId: string): Answer => ({ placeId, tappedPlaceId: placeId, outcome: 'right' });
const wrong = (placeId: string, tappedPlaceId: string): Answer => ({ placeId, tappedPlaceId, outcome: 'wrong' });
const missed = (placeId: string): Answer => ({ placeId, outcome: 'missed' });

const mixUpsOf = (counts: Record<string, number>) => (askedPlaceId: string, answeredPlaceId: string) => counts[`${askedPlaceId}>${answeredPlaceId}`] ?? 0;

const reportOf = (answers: Answer[], missedPlaceIds: string[] = [], mixUps: Record<string, number> = {}) => resultsReportOf({ answers, missedPlaceIds }, { regionOf, mixUpCount: mixUpsOf(mixUps) });

describe('mistake tag', () => {
  it('is new for a first mix-up, a repeat for the second and a classic from the third', () => {
    expect([1, 2, 3, 6].map(mistakeTagOf)).toEqual(['new', 'repeat', 'classic', 'classic']);
  });
});

describe('results report', () => {
  it('lists the deck in the order asked, with places not reached after the answers', () => {
    const { deck } = reportOf([right('NER'), wrong('SVK', 'SVN'), missed('AUS')], ['FJI', 'PER']);
    expect(deck).toEqual([
      { promptNumber: 1, placeId: 'NER', outcome: 'right' },
      { promptNumber: 2, placeId: 'SVK', outcome: 'wrong' },
      { promptNumber: 3, placeId: 'AUS', outcome: 'missed' },
      { promptNumber: 4, placeId: 'FJI', outcome: 'unreached' },
      { promptNumber: 5, placeId: 'PER', outcome: 'unreached' },
    ]);
  });

  it('counts right, wrong and missed, where places not reached count as missed', () => {
    const report = reportOf([right('NER'), wrong('SVK', 'SVN'), missed('AUS')], ['FJI', 'PER']);
    expect(report).toMatchObject({ rightCount: 1, wrongCount: 1, missedCount: 3, unreachedPlaceIds: ['FJI', 'PER'] });
  });

  it('puts classics first, most mixed up first, then the other mistakes in the order asked', () => {
    const { mistakes } = reportOf(
      [wrong('AUT', 'AUS'), wrong('NER', 'NGA'), right('PER'), wrong('TCD', 'MLI'), wrong('SVK', 'SVN')],
      [],
      { 'AUT>AUS': 1, 'NER>NGA': 3, 'TCD>MLI': 2, 'SVK>SVN': 5 },
    );
    expect(mistakes.map(({ askedPlaceId, mixUpCount, tag, promptNumber }) => [askedPlaceId, mixUpCount, tag, promptNumber])).toEqual([
      ['SVK', 5, 'classic', 5],
      ['NER', 3, 'classic', 2],
      ['AUT', 1, 'new', 1],
      ['TCD', 2, 'repeat', 4],
    ]);
  });

  it('takes a mix-up nobody counted as the first', () => {
    expect(reportOf([wrong('NER', 'NGA')]).mistakes).toMatchObject([{ mixUpCount: 1, tag: 'new' }]);
  });

  it('counts a wrong answer without an answered place as wrong but lists no mistake for it', () => {
    const report = reportOf([wrong('NER', '')]);
    expect(report).toMatchObject({ wrongCount: 1, mistakes: [] });
  });

  it('orders regions weakest first by share right, the bigger region first on a tie', () => {
    const { regions: tallies } = reportOf([right('NER'), wrong('NGA', 'NER'), right('TCD'), missed('SVK'), right('PER'), wrong('AUS', 'AUT')], ['SVN', 'FJI', 'MLI']);
    expect(tallies).toEqual([
      { region: 'Europe', right: 0, wrong: 0, missed: 1, unreached: 1, total: 2, unreachedPlaceIds: ['SVN'] },
      { region: 'Oceania', right: 0, wrong: 1, missed: 0, unreached: 1, total: 2, unreachedPlaceIds: ['FJI'] },
      { region: 'Africa', right: 2, wrong: 1, missed: 0, unreached: 1, total: 4, unreachedPlaceIds: ['MLI'] },
      { region: 'South America', right: 1, wrong: 0, missed: 0, unreached: 0, total: 1, unreachedPlaceIds: [] },
    ]);
  });

  it('groups a fill round\'s gaps by region, the emptiest region first', () => {
    const { regions: tallies, mistakes, rightCount, missedCount } = reportOf([right('NER'), right('SVK'), right('SVN'), right('AUT')], ['NGA', 'TCD', 'FJI']);
    expect(tallies.filter(({ unreached }) => unreached > 0).map(({ region, unreachedPlaceIds }) => [region, unreachedPlaceIds])).toEqual([
      ['Oceania', ['FJI']],
      ['Africa', ['NGA', 'TCD']],
    ]);
    expect({ mistakes, rightCount, missedCount }).toEqual({ mistakes: [], rightCount: 4, missedCount: 3 });
  });

  it('leaves out of the regions a place it cannot place', () => {
    expect(reportOf([right('XXX'), right('PER')]).regions.map(({ region, total }) => [region, total])).toEqual([['South America', 1]]);
  });
});

describe('place story', () => {
  const report = reportOf([wrong('NER', 'NGA'), right('NGA'), wrong('TCD', 'NGA'), right('SVK')], ['MLI'], { 'NER>NGA': 4, 'TCD>NGA': 1 });

  it('tells a wrongly answered place\'s prompt, its mix-up and its region\'s tally', () => {
    expect(placeStoryOf(report, 'NER', regionOf)).toMatchObject({
      entry: { promptNumber: 1, outcome: 'wrong' },
      mistake: { answeredPlaceId: 'NGA', mixUpCount: 4, tag: 'classic' },
      answeredInsteadOf: [],
      region: { region: 'Africa', right: 1, total: 4 },
    });
  });

  it('lists the prompts a place was answered instead of, in the order asked', () => {
    const story = placeStoryOf(report, 'NGA', regionOf);
    expect(story).toMatchObject({ entry: { outcome: 'right' }, mistake: null });
    expect(story.answeredInsteadOf.map(({ askedPlaceId }) => askedPlaceId)).toEqual(['NER', 'TCD']);
  });

  it('tells a place not reached and a place outside the round apart', () => {
    expect(placeStoryOf(report, 'MLI', regionOf).entry).toMatchObject({ outcome: 'unreached' });
    expect(placeStoryOf(report, 'PER', regionOf)).toEqual({ entry: null, mistake: null, answeredInsteadOf: [], region: null });
  });
});
