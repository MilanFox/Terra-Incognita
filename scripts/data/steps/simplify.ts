import { runMapshaper } from '../mapshaper.ts';
import type { Land, LandProperties } from '../model.ts';

// keep-shapes protects one ring per feature, so each island is exploded into its own feature first.
export const simplify = (land: Land): Promise<Land> => runMapshaper<LandProperties>({
  inputs: { 'land.json': land },
  commands: '-i land.json -explode -simplify 14% keep-shapes -dissolve id copy-fields=unclaimed',
  outputOptions: 'precision=0.001',
});
