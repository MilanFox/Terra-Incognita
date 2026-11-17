import mapshaper from 'mapshaper';
import { featureCollection } from './model.ts';
import type { FeatureCollection } from './model.ts';

type MapshaperRun = {
  inputs: Record<string, FeatureCollection<unknown>>
  commands: string
  outputOptions?: string
};

export const runMapshaper = async <Properties>({ inputs, commands, outputOptions = '' }: MapshaperRun) => {
  const outputs = await mapshaper.applyCommands(`${commands} -o result.json format=geojson ${outputOptions}`, inputs);
  const output = outputs['result.json'] ?? '';
  const result = JSON.parse(typeof output === 'string' ? output : new TextDecoder().decode(output));
  return (result.type === 'FeatureCollection' ? result : featureCollection([])) as FeatureCollection<Properties>;
};
