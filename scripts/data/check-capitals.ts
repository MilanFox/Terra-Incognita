import { languages } from './steps/names.ts';
import type { CheckLine } from './check.ts';
import type { CapitalNames } from './steps/capitals.ts';

export type CapitalsCheck = { lines: CheckLine[], warnings: string[], infos: string[] };

type CapitalsCheckInput = {
  candidates: Record<string, string[]>
  capitals: Record<string, string[]>
  coastal: string[]
  names: Record<string, CapitalNames>
  unusedDrops: string[]
  unusedAdditions: string[]
};

export const checkCapitals = ({ candidates, capitals, coastal, names, unusedDrops, unusedAdditions }: CapitalsCheckInput): CapitalsCheck => ({
  lines: [
    {
      label: 'every place with capitals has one inside its geometry',
      failures: Object.entries(candidates)
        .filter(([id, qids]) => qids.length > 0 && capitals[id]?.length === 0)
        .map(([id, qids]) => `${id}: ${qids.join(', ')} lie outside`),
    },
    {
      label: 'every capital has an EN and a DE name',
      failures: Object.entries(names).flatMap(([id, capitalNames]) => Object.entries(capitalNames).flatMap(([qid, byLanguage]) =>
        languages.filter(language => !byLanguage[language].name).map(language => `${id} ${qid} has no ${language} name`))),
    },
  ],
  warnings: [
    ...unusedDrops.map(drop => `capital alias drop matches nothing: ${drop}`),
    ...unusedAdditions.map(addition => `capital alias addition names a capital the place does not have: ${addition}`),
  ],
  infos: [
    ...Object.entries(candidates).flatMap(([id, qids]) => qids
      .filter(qid => capitals[id]?.length && !capitals[id].includes(qid))
      .map(qid => `capital left out (outside its place): ${id} ${qid}`)),
    ...coastal.map(capital => `capital accepted within the coastal tolerance: ${capital}`),
  ],
});
