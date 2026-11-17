import { check } from './check.ts';
import { readCurated } from './curated.ts';
import { countByTier } from './model.ts';
import { compute } from './steps/compute.ts';
import { dissolve } from './steps/dissolve.ts';
import { join } from './steps/join.ts';
import { load } from './steps/load.ts';
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

step('5 dissolve the per-tier maps');
const maps = await dissolve(map, curated.places);

step('6 compute bounding boxes');
const facts = compute(maps.dependencies);

step('7 join tier, holder, region, QID and ISO code');
const places = join(curated, ruled.sources, facts);

step('8 check');
const lines = check({ naturalEarth, curated, places, maps });
for (const { label, failures } of lines) {
  console.log(`  ${failures.length ? 'FAIL' : 'ok  '}  ${label}`);
  for (const failure of failures) console.log(`          ${failure}`);
}
if (lines.some(({ failures }) => failures.length)) {
  console.error('The check failed: nothing was written.');
  process.exit(1);
}

step('9 write');
write({ maps, places, version: { ne: naturalEarth.release, counts: countByTier(places) } });
