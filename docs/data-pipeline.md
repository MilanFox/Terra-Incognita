# Data pipeline

The place data the app ships is built from Natural Earth (NE) and the curated rulings in `data/curated/`. Two Node scripts do the work; their outputs in `public/data/` are committed. Vercel never runs the pipeline.

```sh
npm run data:fetch          # network: download the pinned sources (all scopes)
npm run data:fetch -- --ne  # only Natural Earth (also --wikidata, --cldr, --mledoze, --flags)
npm run data:build          # offline and deterministic: rule, patch, simplify, dissolve per tier, compute, join, check, write
```

## Files

| Path | What | In git |
|---|---|---|
| `scripts/data/fetch.ts` | fetch script, one fetcher per scope (`--ne`, `--wikidata`, `--cldr`, `--mledoze`, `--flags`) | yes |
| `scripts/data/build.ts` | build script, runs the steps below in order | yes |
| `scripts/data/steps/` | one module per build step | yes |
| `scripts/data/check.ts`, `scripts/data/check-*.ts` | the build check: the base lines in `check.ts`, one module each for neighbours, dropped borders, island chains, names, capitals and flags (their lines and warnings) | yes |
| `shared/utils/normalise.ts` | D14's normalisation, shared with the answer matcher | yes |
| `scripts/data/sources/natural-earth.ts` | the NE pin: release, file names, sha256 | yes |
| `data/sources/` | committed snapshots of the sources that drift (below) | yes |
| `data/curated/` | the curated rulings (below) | yes |
| `data/.cache/` | downloaded NE files | no (`.cache/` is gitignored) |
| `public/data/` | the shipped files (below) | yes |
| `data/.review/` | the silhouette contact sheet (below) | no (gitignored) |

### Sources

- NE v5.1.2 `ne_10m_admin_0_countries.geojson` (258 features, NE's default de facto view) and its breakaway layer `ne_10m_admin_0_disputed_areas.geojson`, downloaded from the release tag on GitHub. Both are sha256-checked when fetched and again when the build reads them, so a build always runs on the pinned release.

Snapshots, committed in `data/sources/` because the sources drift; the build reads them and never the network:

- `wikidata.json`: one SPARQL result, one binding per line, sorted. For every place QID (read from `public/data/places.json`, plus Abkhazia's flag item Q31354462): EN/DE/`mul` labels, EN/DE altLabels, P41 flags (no end date, not deprecated), P36 capitals (same filter) with their labels, altLabels and P625 coordinates. The four capitals D4 overrides (Ramallah, Tifariti, Jerusalem, Jamestown) are fetched whether or not P36 lists them. Names use the place labels; the capitals feed `capitals` in the shipped files; flags: see below. Sent with the User-Agent `terra-incognita-data-pipeline`.
- `cldr-en-territories.json`, `cldr-de-territories.json`: CLDR v49 territory names, including the `-alt-` forms, from the `cldr-json` tag `49.0.0`.
- `mledoze-alias-subset.json`: the fields of mledoze/countries the aliases need, pinned to a commit. ODbL 1.0, so `names.json` is marked ODbL.
- `flags/<id>.svg`, `flags/licences.json`: per place with a flag, the Commons SVG as downloaded, and per id `{ file, license, artist, attributionRequired, licenseUrl, sha1 }` from the Commons API (`LicenseShortName`, `Artist` with the HTML stripped, `AttributionRequired`, `LicenseUrl`, and the `sha1` of the file as Commons stores it). `npm run data:fetch -- --flags` reads the flag files from `wikidata.json` and the `flag` rulings in `data/curated/places.json` and asks the Commons API for all of them, 50 files per request. It downloads from `upload.wikimedia.org` only the flags whose `sha1` differs from the one in `licences.json` (or whose file changed, or whose SVG is missing), one at a time with a pause, over HTTP/2 with an `Accept` header (`node:http2`, not `fetch`: `upload.wikimedia.org` answers HTTP/1.1 requests, and requests without `Accept`, with 429 after a few in a row). A fetch that finds nothing new makes about five API requests and no download. Every request carries the User-Agent `terra-incognita-data-pipeline/1.0 node/<version>` and is retried on 429/5xx, waiting for `Retry-After`; the error after the last attempt quotes the rate-limit headers and the start of the response body. It writes each downloaded SVG with LF line endings (Commons serves some with CRLF or bare CR), drops snapshots of places that no longer have a flag and prints a `warn` line when a licence field of an existing flag changed.
- `licences/`: the notice texts the build copies into `THIRD-PARTY-NOTICES.txt`, committed by hand: `unicode-license-v3.txt` (cldr-json tag `49.0.0`), `maplibre-gl-js-LICENSE.txt` (maplibre-gl-js tag `v6.19.0`; MapLibre GL JS arrives in milestone 2, bump the file with the dependency) and `mledoze-odbl-notice.txt`.
- `fetched.json`: per source, the date of the fetch that last changed its snapshot (plus the CLDR version and the mledoze commit). A fetch that finds nothing new changes nothing.

### Curated files (`data/curated/`)

Keyed by id, one entry per line. Notes are for maintainers and never shipped.

| File | Shape |
|---|---|
| `places.json` | one entry per place (245): `tier` (`sovereign` \| `defacto` \| `dependencies`), `holder` (the place whose land takes this one in when a tier leaves it out; dependencies and de facto places; for a dependency it must match NE's `SOVEREIGNT`, the six de facto holders are rulings), and only where needed `region` (overrides the M49 default), `flag` (`"<Commons file>"` where Wikidata's P41 is wrong or ambiguous: several flags without an end date, such as historical, civil, state or older variants; or `null` = flagless: `BLM`, `MAF`, `SPM`, `WLF`, `UMI`, `HMD`; every other place needs exactly one P41 flag, else the build fails), `capitals` (list of QIDs replacing the computed capitals; `[]` = no capital: `HMD`, `UMI`, `ATF`, `IOT`, `HKG`, `MAC`; `SHN` = Jamestown), `silhouette: false` (the owner's ruling that the silhouette is unreadable; see [Silhouette contact sheet](#silhouette-contact-sheet)), `silhouetteFrame` (`[west, south, east, north]`: draw only the pieces of the place's own land that have a vertex inside this frame, fitted to it; `FRA`, `NLD` and `NOR` use it for their European mainland), `qid` (fixes or supplies the Wikidata QID), `iso2` (supplies the ISO code of a split place), `note` |
| `features.json` | every NE feature that is not a place: `action` `merge` (land joins `into`), `drop` (land removed) or `unclaimed` (Unclaimed land: drawn, never a place) |
| `carve.json` | places cut out of an NE feature. `source: "breakaway"`: the breakaway layer's `brkA3` polygon is erased from `from` and becomes the place; `from` keeps its own ruling. `source: "split"`: the parts of `from` inside `bbox` become the place; every part of `from` must fall in exactly one split's bbox |
| `aliases.json` | per place id: `note` (why the additions and the name exist, for maintainers), `name` (`en`, `de`: the display name in that language, replacing CLDR's or NE's; a place shows the name it chooses for itself where feasible, e.g. `COD` "DR Congo" / "DR Kongo"), `add` (`en`, `de`: aliases to add; `capitals`: per capital QID, applied to that place's capital) and `drop` (list of `{ lang, alias, why }`, plus `capital`, a QID, for a capital's alias). Matched case-insensitively against what the sources supply, so a drop survives re-ordering; a drop that matches nothing is a warning |
| `patches/*.geojson` | hand-drawn geometry: each feature `{ id, cut? }` replaces the land of place `id` and is erased from the places in `cut` |
| `chains.json` | the island-chain overrides (see [Island chains](#island-chains)): `keep` and `drop` (id to note) |
| `id-changes.json` | `{ idMoves: { "<version>": { old: new } }, removed: { "<version>": [id] } }`, copied whole into `version.json` (see [Data versions](#data-versions)) |
| `dropped-borders.sovereign.json` | the reviewed sovereign dropped-border list (see [Dropped-border list](#dropped-border-list)): `review` (`pending` \| `accepted`) and `pairs`, keyed by the two ids sorted and joined with `-`, each with a note (names and reason) |

Ids are NE's `ADM0_A3`. Carved breakaways use their NE `BRK_A3` (`B35` Abkhazia, `B36` Transnistria, `B37` South Ossetia); NE's `IOA` is split into `CXR` and `CCK`.

### Shipped files (`public/data/`)

All sorted by id.

| File | Shape |
|---|---|
| `map-sovereign.geojson`, `map-defacto.geojson`, `map-dependencies.geojson` | one map per tier: polygons, one feature per place of the tier plus Unclaimed land, `{ id, unclaimed? }`; one feature per line. 200 / 206 / 248 features |
| `places.json` | array, one place per line: `{ id, qid, iso2?, tier, holder?, region, silhouette, silhouetteFrame?, flag, capitals, bbox, ease, neighbours, mainlandNeighbours, microstate }`; `silhouetteFrame` is present only where curated, same shape as `bbox` (an app drawing the silhouette keeps the pieces with a vertex inside it and fits the drawing to it, not to `bbox`); `flag` is `"<id>.svg"` or `null` for a flagless place; `capitals` is a list of QIDs, empty for a place outside Name the capital; `neighbours` and `microstate` each as `{ sovereign, defacto, dependencies }`; `mainlandNeighbours` is a plain sorted id array (sovereign tier only) |
| `points.geojson` | one point per place (245), `{ id, speckZoom }`; one feature per line. The app filters them by tier |
| `chain-outlines.geojson` | the island-chain outlines (see [Island chains](#island-chains)): one polygon per chain place, `{ id, tier }`, sorted by id; one feature per line. A ring that crosses the 180° line runs on past 180° of longitude instead of being cut there. One file for all tiers (G7). The app filters them by tier, as with `points.geojson` |
| `names.json` | `{ "_license": "<ODbL notice>", id: { en: { name, aliases[] }, de: { name, aliases[] }, capitals: { qid: { en: { name, aliases[] }, de: { name, aliases[] } } } } }`, one place per line |
| `flags/<id>.svg` | the Commons SVG with `<metadata>` and comments stripped and, where the root has none (116 of 239 do not), a `viewBox="0 0 <width> <height>"` taken from its pixel width and height; not minified |
| `credits.json` | `[{ id, file, artist, license, licenseUrl }]`, only the flags whose licence requires attribution (Oman, OGL-om 1.0). `artist` is `null` when Commons gives only a placeholder; the About the map footer then names the Commons contributors in the interface language |
| `THIRD-PARTY-NOTICES.txt` | Unicode License v3 (CLDR), MapLibre GL JS 6.19.0's licence in full, and the ODbL notice for mledoze/countries (`names.json` carries the matching `_license` entry) |
| `version.json` | `{ dataVersion, ne, builtAt, counts, sources: { cldr, wikidataDate, flagsDate }, idMoves, removed }`; counts are places per `tier` value. One file covers all three maps. See [Data versions](#data-versions) |

In a tier's map, the land of each place outside the tier is part of the place its holder chain ends in (a place's holder, or the holder's holder, until one is in the tier): dependencies sit in their sovereign in the de facto and sovereign maps, and de facto places in their parent state in the sovereign map. Ids are the same in every map; Unclaimed land and the merges in `features.json` are the same in every map. Only the holders are dissolved again, so every other feature is byte-identical across the three maps.

`bbox` is `[west, south, east, north]` from the place's own land in the dependencies map, in every tier (Denmark's frames Denmark, not Greenland). Its longitudes are the narrowest span that covers all its polygons: for a place across the antimeridian (Russia, the USA, Fiji, Kiribati, New Zealand, US Minor Outlying Islands) `west` is greater than `east`.

`neighbours` and `microstate` are computed per tier from that tier's map, because merged land changes them: in the sovereign map Gibraltar's land makes Spain and the UK neighbours, and Western Sahara's makes Morocco and Mauritania neighbours. A place outside a tier has no land of its own in that tier's map, so its `neighbours` there are `[]` and its `microstate` is `false`. `mainlandNeighbours` is not per tier: Wayfinder is whole-world and sovereign tier only, so it is computed from the sovereign tier alone, and a place outside the sovereign tier (merged into a holder there) has `[]`.

- `neighbours`: the sorted ids of the places that share at least one border segment with it (the same vertices in the same pair, which is what mapshaper's shared arcs are). A touch at a single point is not a border (Namibia–Zimbabwe, Zambia–Botswana), and Unclaimed land is nobody's neighbour. NE 10m leaves a gap between Macao and China (about 650 m raw, 90 m after simplifying), so the build bridges it: they are neighbours in every map that draws both, and the build stops with an error if the gap ever grows beyond 1 km. 319 / 330 / 332 pairs (sovereign / de facto / dependencies).
- `mainlandNeighbours`: the neighbours whose shared border runs between the two places' mainlands; Wayfinder counts only these. A place's mainland is its largest piece on Afro-Eurasia or the Americas, plus its own pieces on the same landmass within 10 km of it. A landmass is a group of pieces joined by shared border segments (Unclaimed land and the Macao bridge included); the two blocks are the landmasses that hold Egypt's and Panama's largest pieces. Pieces of one place that touch count as one piece, as they would once dissolved. The mainland is worked out from the dependencies map with each piece relabelled for the sovereign tier, because the sovereign map has dissolved dependency land into the holder: dependency land never counts toward its holder's mainland (Gibraltar doesn't make Spain and the UK mainland neighbours), breakaway land does (Western Sahara makes Morocco and Mauritania mainland neighbours, and Somaliland Djibouti and Somalia). The 10 km keeps Turkey's Thrace (0.4 km after simplifying) and Croatia's Dubrovnik strip (4.4 km); the nearest piece that stays out and drops a border is Ceuta (15.2 km). 303 pairs. 149 places have a mainland (Afro-Eurasia 127, the Americas 22); a place without one has `[]`. Every other sovereign neighbour pair is a dropped border: 16 pairs.
- `microstate`: the place's largest single piece of land is below 2,500 km² (spherical area, holes subtracted). 29 / 29 / 65 places. The nearest on either side are Mauritius (1,834 km², a microstate) and Luxembourg (2,614 km², not). The Vatican is a triangle of 0.28 km² after simplifying (real: 0.44 km²); either is far below the threshold.
- `ease`: rank by NE `POP_EST`, 1 for the most populous; ties go by id. The five places without an NE feature of their own (Abkhazia `B35`, Transnistria `B36`, South Ossetia `B37`, Cocos Islands `CCK`, Christmas Island `CXR`) have no figure and rank last, 241–245.
- `speckZoom` (in `points.geojson`): the zoom from which the place's largest piece of own land (dependencies map) is drawn at least 2 px wide, measured as the side of a square of the same area on a 512 px Web Mercator map at the point's latitude, rounded up to 0.1. Below that zoom the app draws a 2 px speck at the point; from it on, the place's own polygon is big enough. Large places get a negative `speckZoom`. The point is mapshaper's inner point of that largest piece, so a speck always sits on the place's land. 94 places have a `speckZoom` above 0; the Vatican's is the highest at 7.8.

## Build steps

Step numbers follow the spec; step 10 (silhouette sheet) is described under [Silhouette contact sheet](#silhouette-contact-sheet).

1. **Load** (`steps/load.ts`): read both NE files from the cache and verify their sha256.
2. **Rule** (`steps/rule.ts`): erase the breakaways from their host, apply `features.json`, split `IOA`. Each place keeps NE's QID and ISO code (`ISO_A2_EH` for countries, `ISO_A2` for breakaways; a split inherits neither) and the M49 fields of the feature its land comes from.
3. **Patch** (`steps/patch.ts`): apply `patches/` (Vatican City and the matching hole in Italy), before simplifying, so the patch is simplified like everything else.
4. **Simplify** (`steps/simplify.ts`): explode each place into islands, simplify 14% with `keep-shapes`, dissolve per id, precision 0.001. Without the explode step only one ring per place survives. The result is the dependencies map.
5. **Dissolve** (`steps/dissolve.ts`): for the sovereign and de facto maps, relabel each place outside the tier with the end of its holder chain (from `places.json`) and dissolve the holders, precision 0.001. A broken chain leaves the land under its own id, and the check fails on it.
6. **Compute** (`steps/compute.ts`): each place's `bbox` from the dependencies map. Then (`steps/borders.ts`, `steps/tier-facts.ts`) per tier: the pieces of land in the tier's map and which pieces share a border segment, with the Macao–China gap bridged; `neighbours` and `microstate` from them. `steps/specks.ts`: the speck point and `speckZoom` from the dependencies map. `steps/ease.ts`: the ease rank. `steps/chains.ts`: per tier, the island chains and their outlines (see [Island chains](#island-chains)). `steps/mainland.ts`: for the sovereign tier only, each place's mainland and `mainlandNeighbours`. `steps/capitals.ts`: the capitals that lie inside each place's own land (see [Capitals](#capitals)).
7. **Join** (`steps/join.ts`): tier and holder from `places.json`, `bbox` from step 6; QID, ISO code and region from the curated override, else from NE. The default region comes from NE's UN M49 fields: North America = Northern America + Central America + Caribbean; NE's "Seven seas (open ocean)" gives no region, so those places carry an override.
   - **Names** (`steps/names.ts`): the display name is CLDR's for the place's ISO code, else NE's `NAME_EN` / `NAME_DE` (the breakaway layer's for carved breakaways), unless `aliases.json` gives the place a `name` in that language, which replaces it. Aliases are added in this order and deduplicated case-insensitively: the replaced display name (where `name` replaced one, so it stays an accepted answer), CLDR alt forms, Wikidata label, `mul` label and EN/DE altLabels, mledoze (`name.common`, `name.official`, `altSpellings`; for DE the German translation), NE's name, and `add` from `aliases.json`. Everything but the name, the replaced name and the hand additions is filtered: short codes ("DE", "deu"; CLDR is exempt, which keeps "UK"), machine strings (ISO 3166-2 codes, time-zone ids, strings without letters), non-Latin script, then the `drop` list. Wikidata's `mul` altLabels are not used: they mix languages and were not reviewed. The 23 reviewed aliases that Wikidata moved to `mul` after #10 (Hellas, Malvinas, Føroyar, ...) are hand additions in `aliases.json`.
   - **Capitals** (`steps/capitals.ts`): the EN and DE names and aliases of the capitals kept in step 6 (see [Capitals](#capitals)).
   - **Flags** (`steps/flags.ts`): a place's flag is its `flag` ruling in `places.json`, else its single P41 flag. The snapshot SVG is copied with line endings normalised to LF, `<metadata>` and comments removed and a `viewBox` added from `width`/`height` when missing; a file that still has none (other units, no size) fails the check. The credits are the flags with `attributionRequired`.
8. **Check** (`check.ts`, `check-*.ts`): the build prints the sovereign dropped borders, then the check lines; see below. A failure stops the build before anything is written.
9. **Write** (`steps/write.ts`, and `steps/flags.ts` for the flags, credits and notices): write the shipped files sorted by id, and print their sizes.

A broken reference in the curated files (a merge into a non-place, a carve whose `from` or `brkA3` doesn't exist, a split bbox that holds no part, a patch for an id without land) stops the build with an error at the step that meets it.

10. **Silhouette sheet** (`steps/silhouettes.ts`): after the shipped files are written; see below.

## Silhouette contact sheet

The last build step writes `data/.review/silhouettes/index.html` (about 1 MB, gitignored, not shipped): one self-contained HTML file with all 245 silhouettes in a grid, each labelled with its id and EN name. Open it in a browser. Each silhouette is the place's own land from the dependencies map, so it is the same in every tier. It is drawn equirectangular (longitude scaled by the cosine of the middle latitude) and fitted to the place's own `bbox`, so sizes are not comparable between places; places across the antimeridian are drawn in one piece.

The pipeline flags candidates, outlined in red with the reason under the label, by four heuristics (the spec gives no criteria): `tiny` (own land below 100 km²), `fragmented` (at least 8 pieces and the largest holds under 50% of the land), `elongated` (the bbox in the drawing is more than 5:1), `sparse` (land is under 2% of the bbox area, measured in km²; drawn nearly blank). Every piece is drawn with a minimum visible size (a 2.5 px stroke), so no cell looks empty. The build prints the flagged ids with their reasons. A flag only suggests; nothing is ruled unreadable by the build.

The owner's review result goes into `data/curated/places.json`: `"silhouette": false` on each place ruled unreadable. `places.json` in `public/data/` carries `silhouette: boolean`, false only for those places, so today it is true everywhere. The app drops places with `silhouette: false` from the silhouette variant of Name that country.

A place with `silhouetteFrame` in the curated file is drawn from that frame only: the sheet and the app keep the pieces of its own land with a vertex inside the frame and fit the drawing to the frame instead of the `bbox`. `FRA` (metropolitan France with Corsica), `NLD` (European Netherlands), `NOR` (without Svalbard and Jan Mayen), `PRT` (without the Azores and Madeira), `CHL` (without Easter Island, Juan Fernández and San Félix), `NZL` (North, South and Stewart Island), `USA` (contiguous 48), `JPN` (main islands, without the Ryukyu and Ogasawara Islands), `GNQ` (Río Muni and Bioko) and `ECU` (without the Galápagos) use it, because their own land includes far islands or overseas parts that would leave the drawing mostly sea; `IDN` and `PHL` are drawn as they are.

## Build check

The build fails, and writes nothing, on:

- an NE feature covered by neither `places.json`, `features.json` nor a split in `carve.json`, or covered by more than one of them
- tier counts other than 197 / 6 / 42
- map feature counts other than 200 / 206 / 248 (sovereign / de facto / dependencies: the tier's places plus 3 Unclaimed land)
- duplicate ids: a key twice in a curated file, a patch id twice, or a carved place reusing an NE feature id
- a place without geometry
- a place without one of the six regions
- a place without a Wikidata QID
- a dependency whose curated holder differs from NE's: the feature with `ADMIN` equal to the `SOVEREIGNT` of the NE feature its land comes from (`IOA` for `CXR` and `CCK`). The six de facto holders are rulings NE has no field for, so they are not compared
- a holder chain that does not end in a place of the tier, checked for every place outside each tier: no holder, a holder that is not a place, or a loop
- asymmetric neighbours: in some tier a place lists another that doesn't list it back (this also catches a neighbour outside the tier, whose list there is empty)
- the sovereign dropped borders differing from `data/curated/dropped-borders.sovereign.json`, whether or not that list is reviewed yet; a missing file counts as empty. `+` marks a pair the build drops that the list lacks, `-` a listed pair the build no longer drops
- an island chain check (see [Island chains](#island-chains)): any of the 9 sovereign chains from the prototype missing, a tier's chains differing from the expected 9 / 0 / 14, a chain without exactly one outline, an outline wider than 180° of longitude, outlines overlapping outside the accepted pair, an accepted pair that no longer overlaps, or a `keep` / `drop` that no longer applies
- a place without an EN or a DE name
- a display-name override (`name` in `aliases.json`) for an id that is not a place, or in a language other than `en` and `de`
- a place with capitals none of which lies inside its geometry
- a capital without an EN or a DE name
- a place that is not flagless without a flag SVG (no or several unruled P41 flags, a missing snapshot or licence entry, a snapshot of another file than the ruling names)
- a flag SVG without a `viewBox`, or of 2 MiB or more
- an id of the previous `places.json` (the one on disk) that is neither present, nor a key of this version's `idMoves`, nor in this version's `removed`
- an `idMoves` target of this version that is not a place

It warns, and still writes, on geometry that changed since the last version (any `map-<tier>.geojson` differing from the one on disk), on the dropped-border list having a `review` other than `accepted`, on a name or alias that normalises identically (`normaliseKeys`, umlauts both ways) for two places, and on an alias drop, capital or not, that matches nothing, and on a capital alias addition for a capital the place doesn't have. A new attribution-required flag, or a changed licence of one, compared with the previous `credits.json`, is a warning too (no warning when that file doesn't exist yet). Capitals left out for lying outside their place, and capitals accepted only within the coastal tolerance, are printed as `info` lines, not warnings. The collision list is the one to review after a fetch or an alias edit: fix it by dropping the alias in `aliases.json`, or accept it if both places really are called that.

## Data versions

`dataVersion` in `public/data/version.json` is an incrementing integer, never bumped by hand. Step 9 writes `version.json` last: if any other shipped file (the maps, places, points, chain outlines, names, flags, credits, notices) or any `version.json` field besides `dataVersion` and `builtAt` differs from what is on disk, `dataVersion` is the old value plus 1 and `builtAt` is today's date; otherwise both stay, so a rebuild with no change is byte-identical. "Committed files" means the shipped files on disk that the build overwrites, not `git show HEAD:`: rebuilding after a revert therefore bumps again (a change and its revert are two versions) unless the files were restored first. The first build with these fields starts at 1.

`sources` is read from `data/sources/fetched.json`: the CLDR version and the dates of the Wikidata and flags snapshots. Those dates move only when that source's snapshot content changed, so a fetch that finds nothing new changes nothing.

Triggers, same flow each time: NE release (bump the pin, fetch, build), source drift (fetch, build), curated edit (build). The build fails on anything unruled; rule it, rebuild, review the diff, commit, deploy.

An id that disappears must be ruled in `data/curated/id-changes.json`, under the version the build is about to produce (the current `dataVersion` + 1, which the check names in its line):

- moved or merged: `idMoves["<version>"]["OLD"] = "NEW"` (several olds may share one new; a split lists each old id once, with the id that keeps the player's history)
- gone for good: add the id to `removed["<version>"]`

Targets must exist. The app applies `idMoves` in order for each version a player is missing (D17); `removed` records are kept but hidden. Adding an entry is itself a change of output, so it lands in the same bump. The whole file is copied into `version.json`, so the history stays shipped.

## Dropped-border list

A dropped border is a pair of neighbours that are not mainland neighbours. The build prints the sovereign list at the start of step 8, before the check lines, generated from the final geometry: the pair, the EN names from the names step, and the reason it finds for each side whose land at the border isn't mainland:

- **island landmass**: the border lies on a landmass that is neither block (Ireland, Hispaniola, Borneo, Saint Martin). Land of another place merged in for the tier is named in brackets.
- **overseas part of X**: X's land at the border lies on the other block from X's mainland (French Guiana), or it is dependency land, named in brackets (Gibraltar).
- **exclave of X**: X's land at the border lies on the same landmass as X's mainland, more than 10 km from it (Kaliningrad, Ceuta and Melilla).

The list is committed in `data/curated/dropped-borders.sovereign.json` for the owner's one-time review (#38). `review` records where that stands: `pending` until the owner has read the list, then `accepted`. The check compares the pairs whatever `review` says; a pending list only adds a warning. Only the keys are compared; the notes are for the reader.

**After a ruling change** (or an NE bump) that moves a mainland, the build fails and prints the difference. For each `+` pair, check that it is an overseas part, an exclave or an island landmass in the sense of D13: if it is, add it to `pairs` with the printed note; if it isn't, fix the ruling or the mainland rule instead. Delete each `-` pair. Set `review` to `pending` in the list until the owner has read the changed pairs, then back to `accepted`. Rebuild.

## Island chains

A place is an island chain when, on its own tier's map (sovereign places on the sovereign map, de facto on the de facto map, dependencies on the dependencies map; the simplified geometry), it has at least 2 pieces, its bounding box is more than 10 times its land area, and its largest piece is under 6,000 km². Areas are spherical; the bounding box takes the narrowest longitude span (`bboxOf` in `steps/compute.ts`). The 6,000 km² limit is the chain rule's own and has nothing to do with the microstate threshold. The two constants are `chainMinBboxRatio` and `chainMaxLargestPieceKm2` in `steps/chains.ts`.

`data/curated/chains.json` overrides the rule:

- `keep`: a place that is a chain whatever the rule says. None at present.
- `drop`: a place that is not a chain. `UMI` spans the Caribbean and the Pacific. Island places that are easy to recognise on the map get no outline (owner ruling, #126): Bahamas, São Tomé and Príncipe, Cabo Verde, Antigua and Barbuda, Mauritius, Comoros, Seychelles and Turks and Caicos.

Every chain gets exactly one outline around all its pieces. The map repeats sideways, so a chain that crosses the 180° line is taken as one run of longitudes (the land east of the line moves a turn further east) and its outline crosses the line with it: Kiribati's runs from 169° to 209°. St Helena's covers Ascension, St Helena and Tristan da Cunha.

Each outline starts as the convex hull of the chain's land, padded with a rounded corner (radius at least 0.4°, up to 0.35 of the hull's narrow side). Outlines that overlap get less round, in steps of 0.05, until they clear.

A chain whose convex hull overlaps another outline even with the least padding gets a closer-fitting outline instead (`fitted-outline.ts`), the longest chain first. It is the line a ball leaves when it rolls around the chain's islands and the shortest links between them, pushed out by the 0.4° padding. The ball starts as wide as the chain is long, which leaves nearly the convex hull, and shrinks by 0.7 per step until the outline is clear of every other one or the ball is as small as the padding. Kiribati is fitted this way, because its hull covers Penrhyn in the Cook Islands. Overlaps are tested on every world copy, across all tiers.

One overlap remains with the closest fit and is accepted: the US / British Virgin Islands; both are drawn with their closest-fitting outline. Any other overlap fails the check, and so does an accepted pair that no longer overlaps, so the exception is removed with it. An outline wider than 180° of longitude fails the check too.

Current chains per tier (sovereign / de facto / dependencies): 9 / 0 / 14, and 23 outlines in the file, one per chain.

- Sovereign: MDV TUV MHL KIR FSM PLW TON SLB VUT, the prototype's 12 without the dropped SYC CPV COM. The margins are thin (by the rule, Comoros 10.6 against St Vincent 9.6; the Solomon Islands' largest piece 5,387 km² against the 6,000 km² limit), which is why the check names all 9.
- Dependencies: PCN PYF VIR AIA VGB CYM SHN GGY IOT COK WLF SGS ASM MNP.

The `tier` of an outline is its place's tier. A tier's play uses the outlines of every place in it, as with `points.geojson`.

## Capitals

A place's capitals are the P36 statements of its Wikidata item (no end date, not deprecated), or the curated `capitals` list where `places.json` has one. Each capital has EN and DE names (label in the language, else `mul`, else English) and aliases (the language's altLabels only, never `mul`, filtered like place aliases, then the alias file's capital drops and additions). Only capitals that lie inside the place's own land count (D4, G8): in step 6, the P625 point is tested against the unsimplified dependencies land of that place, the same for every tier. That is why Palestine has Ramallah, Western Sahara Tifariti and Israel Jerusalem, and why East Jerusalem and Laayoune are left out. A place with no capital strictly inside falls back to the capitals within 10 km of its land, because NE's 1:10m coastline puts a few coastal and atoll capitals (Funafuti, Tarawa, Banjul) in the sea; each one is printed as an `info` line. A place whose capitals are all farther out stops the build: rule it with `capitals` in `places.json`.

## Updating the name sources

`npm run data:fetch -- --wikidata` (or `--cldr`, `--mledoze`), then `npm run data:build`. Read the warnings and the diff of `data/sources/` and `public/data/names.json`: new aliases from Wikidata arrive unreviewed. Bump `cldrVersion` in `scripts/data/sources/cldr.ts` or `mledozeCommit` in `scripts/data/sources/mledoze.ts` to move those pins.

## Updating the flags

`npm run data:fetch -- --flags`, then `npm run data:build`. Read the `warn` lines of both (licence changes, new attribution-required files) and the diff of `data/sources/flags/` and `public/data/credits.json`. A flag that needs attribution is shown in the footer once milestone 9 lands; check its `Artist` text. A Commons SVG without a `viewBox` fails the build: pick another file with `flag` in `data/curated/places.json`. A new P41 flag on Wikidata that makes a place ambiguous also fails it: rule its `flag` there.

## Updating Natural Earth

Bump `naturalEarthRelease` and both sha256 values in `scripts/data/sources/natural-earth.ts`, run `npm run data:fetch -- --ne`, then `npm run data:build`. The build fails on anything unruled; rule it in `data/curated/`, rebuild, and review the diff of `public/data/`.

## Drift workflow

`.github/workflows/data-drift.yml` re-fetches the sources that drift. It runs on the 1st of every month at 06:00 UTC and on demand (Actions → Data drift → Run workflow).

It fetches Natural Earth from the pin (a cache of `data/.cache`, not a bump), then Wikidata, CLDR and the flags, then runs `npm run data:build`. The flags fetch downloads only the flags that changed on Commons (see [Sources](#sources)), so it takes seconds when nothing did and about four minutes when every flag is downloaded. Natural Earth bumps stay manual (see above).

- **Nothing changed and the check passed**: no branch, no PR.
- **Anything changed, or the check failed**: the changes are committed to the fixed branch `data-drift` (force-pushed) and a PR to `main` is opened. If a drift PR is already open, its branch and body are updated instead of opening a second one. A failed check writes nothing in `public/data/`, so such a PR carries only the snapshot changes, and the run is marked failed.
- **PR body**: diff summary, the `version.json` diff, the full check output with its `warn` and `info` lines, and a checklist including "rulings changed → update About the map copy".

To review, read the warnings and the diff of `data/sources/` and `public/data/`. If the build failed, check out `data-drift`, rule what is unruled in `data/curated/` (plus `idMoves` / `removed`), run `npm run data:build`, and push to the branch. Then merge by hand. Nothing merges automatically. Checks do not start on the PR by themselves, because pushes made with `GITHUB_TOKEN` do not trigger workflows; push an extra commit if you want them.

One-time repo setting: Settings → Actions → General → Workflow permissions → enable "Allow GitHub Actions to create and approve pull requests". Without it the PR step fails after the push.
