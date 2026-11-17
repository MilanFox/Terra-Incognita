import { check } from './check.ts';
import { chainChecks } from './check-chains.ts';
import { droppedBorderNotes, droppedBordersMatch, printDroppedBorders } from './check-dropped-borders.ts';
import { neighboursAreSymmetric } from './check-neighbours.ts';
import { readCurated } from './curated.ts';
import { countByTier } from './model.ts';
import { bordersByTier } from './steps/borders.ts';
import { chainsOf, readChainRulings } from './steps/chains.ts';
import { compute } from './steps/compute.ts';
import { dissolve } from './steps/dissolve.ts';
import { easeRanks } from './steps/ease.ts';
import { join } from './steps/join.ts';
import { load } from './steps/load.ts';
import { mainlandsByTier } from './steps/mainland.ts';
import { patch } from './steps/patch.ts';
import { rule } from './steps/rule.ts';
import { simplify } from './steps/simplify.ts';
import { speckPoints } from './steps/specks.ts';
import { tierFacts } from './steps/tier-facts.ts';
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

step('6 compute neighbours and microstates per tier, specks and ease');
const borders = bordersByTier(maps);
const points = await speckPoints(maps.dependencies);
const ease = easeRanks(naturalEarth, Object.keys(curated.places));

step('6 compute island chains and their outlines per tier');
const chains = chainsOf(maps, curated.places, readChainRulings());

step('6 compute mainland neighbours per tier and list the dropped borders');
const mainlands = mainlandsByTier(borders, curated.places);
const placeTierFacts = tierFacts(borders, mainlands, curated.places);
const droppedBorders = droppedBorderNotes(mainlands, naturalEarth);
printDroppedBorders(mainlands, droppedBorders);

step('7 join tier, holder, region, QID and ISO code');
const places = join(curated, ruled.sources, facts);

step('8 check');
const lines = check({ naturalEarth, curated, places, maps });
lines.push(neighboursAreSymmetric(placeTierFacts));
const droppedBordersCheck = droppedBordersMatch(droppedBorders);
lines.push(droppedBordersCheck.line);
lines.push(...chainChecks(chains));
for (const { label, failures } of lines) {
  console.log(`  ${failures.length ? 'FAIL' : 'ok  '}  ${label}`);
  for (const failure of failures) console.log(`          ${failure}`);
}
for (const warning of droppedBordersCheck.warnings) console.log(`  warn  ${warning}`);
if (lines.some(({ failures }) => failures.length)) {
  console.error('The check failed: nothing was written.');
  process.exit(1);
}

step('9 write');
const shippedPlaces = places.map(place => ({ ...place, ease: ease.get(place.id), ...placeTierFacts.get(place.id) }));
write({ maps, places: shippedPlaces, points, chainOutlines: chains.outlines, version: { ne: naturalEarth.release, counts: countByTier(places) } });
