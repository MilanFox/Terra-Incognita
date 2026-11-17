import { check } from './check.ts';
import { checkCapitals } from './check-capitals.ts';
import { chainChecks } from './check-chains.ts';
import { droppedBorderNotes, droppedBordersMatch, printDroppedBorders } from './check-dropped-borders.ts';
import { checkFlags } from './check-flags.ts';
import { geometryChanged, idChecks } from './check-versions.ts';
import { checkNames } from './check-names.ts';
import { neighboursAreSymmetric } from './check-neighbours.ts';
import { readCurated } from './curated.ts';
import { countByTier } from './model.ts';
import { bordersByTier } from './steps/borders.ts';
import { capitalNames, capitalsInside, loadCapitalSources } from './steps/capitals.ts';
import { chainsOf, readChainRulings } from './steps/chains.ts';
import { compute } from './steps/compute.ts';
import { dissolve } from './steps/dissolve.ts';
import { easeRanks } from './steps/ease.ts';
import { joinFlags, loadFlagSources, writeFlagFiles } from './steps/flags.ts';
import { join, qidOf } from './steps/join.ts';
import { load } from './steps/load.ts';
import { mainlandsByTier } from './steps/mainland.ts';
import { joinNames, loadNameSources } from './steps/names.ts';
import { patch } from './steps/patch.ts';
import { rule } from './steps/rule.ts';
import { silhouetteSheet, writeSilhouetteSheet } from './steps/silhouettes.ts';
import { simplify } from './steps/simplify.ts';
import { speckPoints } from './steps/specks.ts';
import { tierFacts } from './steps/tier-facts.ts';
import { readIdChanges, readPreviousOutput, readSourceStamps, writeVersion } from './steps/version.ts';
import { write } from './steps/write.ts';
import type { ShippedPlace } from './steps/write.ts';

const step = (name: string) => console.log(name);

const previousOutput = readPreviousOutput();
const idChanges = readIdChanges();

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

step('6 compute mainland neighbours per tier');
const mainlands = mainlandsByTier(borders, curated.places);
const placeTierFacts = tierFacts(borders, mainlands, curated.places);

step('6 compute the capitals inside their place');
const nameSources = loadNameSources();
const capitalSources = loadCapitalSources(nameSources.aliasRulings);
const placeQids = Object.keys(curated.places).map(id => ({ id, qid: qidOf(id, curated, ruled.sources) }));
const { candidates, capitals, coastal } = capitalsInside(placeQids, { curated, land: patched }, capitalSources);

step('7 join tier, holder, region, QID and ISO code');
const places = join(curated, ruled.sources, facts);

step('7 join names and aliases');
const { names, unusedDrops } = joinNames(places, { naturalEarth, curated }, nameSources);

step('7 join capitals with names and aliases');
const capitalJoin = capitalNames(capitals, capitalSources);
for (const [id, byCapital] of Object.entries(capitalJoin.names)) names[id]!.capitals = byCapital;

step('7 join flags');
const flagSources = loadFlagSources();
const flagJoin = joinFlags(places, flagSources);

step('8 list the dropped borders and check');
const droppedBorders = droppedBorderNotes(mainlands, names);
printDroppedBorders(mainlands, droppedBorders);
const lines = check({ naturalEarth, curated, places, maps });
lines.push(neighboursAreSymmetric(placeTierFacts));
const droppedBordersCheck = droppedBordersMatch(droppedBorders);
lines.push(droppedBordersCheck.line);
lines.push(...chainChecks(chains));
const namesCheck = checkNames(names, places.map(({ id }) => id), unusedDrops);
const capitalsCheck = checkCapitals({ candidates, capitals, coastal, ...capitalJoin });
const flagsCheck = checkFlags(flagJoin, flagSources);
lines.push(...namesCheck.lines, ...capitalsCheck.lines, ...flagsCheck.lines);
lines.push(...idChecks(previousOutput, places.map(({ id }) => id), idChanges));
for (const { label, failures } of lines) {
  console.log(`  ${failures.length ? 'FAIL' : 'ok  '}  ${label}`);
  for (const failure of failures) console.log(`          ${failure}`);
}
for (const info of capitalsCheck.infos) console.log(`  info  ${info}`);
const warnings = [...droppedBordersCheck.warnings, ...namesCheck.warnings, ...capitalsCheck.warnings, ...flagsCheck.warnings, ...geometryChanged(previousOutput, maps)];
for (const warning of warnings) console.log(`  warn  ${warning}`);
if (lines.some(({ failures }) => failures.length)) {
  console.error('The check failed: nothing was written.');
  process.exit(1);
}

step('9 write');
// The spec's key order puts flag and capitals before bbox.
const shippedPlaces = places.map(({ bbox, ...place }): ShippedPlace => ({
  ...place,
  flag: flagJoin.flags[place.id]!,
  capitals: capitals[place.id]!,
  bbox,
  ease: ease.get(place.id)!,
  ...placeTierFacts.get(place.id)!,
}));
write({ maps, places: shippedPlaces, points, chainOutlines: chains.outlines, names });
writeFlagFiles(flagJoin);
writeVersion(previousOutput, { ne: naturalEarth.release, counts: countByTier(places), sources: readSourceStamps(), ...idChanges });

step('10 write the silhouette contact sheet for review');
writeSilhouetteSheet(silhouetteSheet(maps.dependencies, places, names));
