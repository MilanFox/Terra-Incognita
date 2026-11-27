import { describe, expect, it } from 'vitest';
import { landAidedPlaceId } from './landAssist';
import type { MapDrawing } from './chainOutlines';

const fullMap: MapDrawing = { landShown: 1, drawnPlaceIds: [], poolPlaceIds: null, gapPlaceIds: [] };
const microstatePlaceIds = ['VAT', 'SMR', 'MCO'];

describe('landAidedPlaceId', () => {
  const tapOnItaly = { tap: { x: 100, y: 100 }, hitPlaceId: 'ITA', microstatePlaceIds };
  const vaticanNearby = [{ placeId: 'VAT', x: 110, y: 104, speckZoom: 7.8 }, { placeId: 'ITA', x: 160, y: 20, speckZoom: -2.1 }];

  it('picks the Vatican over Italy for a tap near its point at zoom 10', () => {
    expect(landAidedPlaceId({ ...tapOnItaly, specks: vaticanNearby, zoom: 10 }, fullMap)).toBe('VAT');
  });

  it('keeps Italy at zoom 5, before the Vatican\'s own land is drawn', () => {
    expect(landAidedPlaceId({ ...tapOnItaly, specks: vaticanNearby, zoom: 5 }, fullMap)).toBe('ITA');
  });

  it('keeps Italy for a tap more than 22 px from the Vatican\'s point', () => {
    const specks = [{ placeId: 'VAT', x: 123, y: 100, speckZoom: 7.8 }];
    expect(landAidedPlaceId({ ...tapOnItaly, specks, zoom: 10 }, fullMap)).toBe('ITA');
  });

  it('never lets a place that is not a microstate take the tap', () => {
    const specks = [{ placeId: 'LUX', x: 104, y: 100, speckZoom: 1 }];
    expect(landAidedPlaceId({ ...tapOnItaly, hitPlaceId: 'BEL', specks, zoom: 2 }, fullMap)).toBe('BEL');
  });

  it('never lets a microstate outside the pool take the tap', () => {
    expect(landAidedPlaceId({ ...tapOnItaly, specks: vaticanNearby, zoom: 10 }, { ...fullMap, poolPlaceIds: ['ITA', 'SMR'] })).toBe('ITA');
  });
});
