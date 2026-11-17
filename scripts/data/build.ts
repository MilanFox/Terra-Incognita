import { check } from './check.ts';
import { checkCapitals } from './check-capitals.ts';
import { checkNames } from './check-names.ts';
import { readCurated } from './curated.ts';
import { countByTier } from './model.ts';
import { capitalNames, joinCapitals, loadCapitalSources } from './steps/capitals.ts';
import { join } from './steps/join.ts';
import { load } from './steps/load.ts';
import { joinNames, loadNameSources } from './steps/names.ts';
import { patch } from './steps/patch.ts';
import { rule } from './steps/rule.ts';
import { simplify } from './steps/simplify.ts';
import { write } from './steps/write.ts';

const step = (name: string) => console.log(name);

step('1 load Natural Earth from the cache');
const naturalEarth = load();
const curated = readCurated();

step('2 rule features, carve breakaways, split');
const ruled = await rule(naturalEarth, curated);

step('3 patch geometry');
const patched = await patch(ruled.land, curated.patches);

step('4 simplify');
const map = await simplify(patched);

step('7 join tier, holder, region, QID and ISO code');
const places = join(curated, ruled.sources);

step('7 join names and aliases');
const nameSources = loadNameSources();
const { names, unusedDrops } = joinNames(places, { naturalEarth, curated }, nameSources);

step('7 join capitals with names and aliases');
const capitalSources = loadCapitalSources(nameSources.aliasRulings);
const { candidates, capitals, coastal } = joinCapitals(places, { curated, land: patched }, capitalSources);
const capitalJoin = capitalNames(capitals, capitalSources);
for (const [id, byCapital] of Object.entries(capitalJoin.names)) names[id]!.capitals = byCapital;

step('8 check');
const namesCheck = checkNames(names, places.map(({ id }) => id), unusedDrops);
const capitalsCheck = checkCapitals({ candidates, capitals, coastal, ...capitalJoin });
const lines = [...check({ naturalEarth, curated, places, map }), ...namesCheck.lines, ...capitalsCheck.lines];
for (const { label, failures } of lines) {
  console.log(`  ${failures.length ? 'FAIL' : 'ok  '}  ${label}`);
  for (const failure of failures) console.log(`          ${failure}`);
}
for (const info of capitalsCheck.infos) console.log(`  info  ${info}`);
for (const warning of [...namesCheck.warnings, ...capitalsCheck.warnings]) console.log(`  warn  ${warning}`);
if (lines.some(({ failures }) => failures.length)) {
  console.error('The check failed: nothing was written.');
  process.exit(1);
}

step('9 write');
write({ map, places: places.map(place => ({ ...place, capitals: capitals[place.id]! })), names, version: { ne: naturalEarth.release, counts: countByTier(places) } });
