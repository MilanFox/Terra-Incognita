import { naturalEarthFiles, naturalEarthRelease } from '../sources/natural-earth.ts';
import { readPinned } from '../sources/pinned-file.ts';
import type { FeatureCollection } from '../model.ts';

export type NeCountry = {
  ADM0_A3: string
  WIKIDATAID: string
  ISO_A2_EH: string
  REGION_UN: string
  SUBREGION: string
  [field: string]: unknown
};

export type NeBreakaway = {
  BRK_A3: string
  WIKIDATAID: string
  ISO_A2: string
  [field: string]: unknown
};

export type NaturalEarth = {
  release: string
  countries: FeatureCollection<NeCountry>
  breakaway: FeatureCollection<NeBreakaway>
};

export const load = (): NaturalEarth => ({
  release: naturalEarthRelease,
  countries: JSON.parse(readPinned(naturalEarthFiles.countries)),
  breakaway: JSON.parse(readPinned(naturalEarthFiles.breakaway)),
});
