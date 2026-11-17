# Data pipeline

The place data the app ships is built from Natural Earth (NE) and the curated rulings in `data/curated/`. Two Node scripts do the work; their outputs in `public/data/` are committed. Vercel never runs the pipeline.

```sh
npm run data:fetch          # network: download the pinned sources (all scopes)
npm run data:fetch -- --ne  # only Natural Earth
npm run data:build          # offline and deterministic: rule, patch, simplify, dissolve per tier, check, write
```

## Files

| Path | What | In git |
|---|---|---|
| `scripts/data/fetch.ts` | fetch script, one fetcher per scope (`--ne`) | yes |
| `scripts/data/build.ts` | build script, runs the steps below in order | yes |
| `scripts/data/steps/` | one module per build step | yes |
| `scripts/data/check.ts`, `scripts/data/check-neighbours.ts` | the build check | yes |
| `scripts/data/sources/natural-earth.ts` | the NE pin: release, file names, sha256 | yes |
| `data/curated/` | the curated rulings (below) | yes |
| `data/.cache/` | downloaded NE files | no (`.cache/` is gitignored) |
| `public/data/` | the shipped files (below) | yes |

### Sources

- NE v5.1.2 `ne_10m_admin_0_countries.geojson` (258 features, NE's default de facto view) and its breakaway layer `ne_10m_admin_0_disputed_areas.geojson`, downloaded from the release tag on GitHub. Both are sha256-checked when fetched and again when the build reads them, so a build always runs on the pinned release.

### Curated files (`data/curated/`)

Keyed by id, one entry per line. Notes are for maintainers and never shipped.

| File | Shape |
|---|---|
| `places.json` | one entry per place (245): `tier` (`sovereign` \| `defacto` \| `dependencies`), `holder` (the place whose land takes this one in when a tier leaves it out; dependencies and de facto places; for a dependency it must match NE's `SOVEREIGNT`, the six de facto holders are rulings), and only where needed `region` (overrides the M49 default), `qid` (fixes or supplies the Wikidata QID), `iso2` (supplies the ISO code of a split place), `note` |
| `features.json` | every NE feature that is not a place: `action` `merge` (land joins `into`), `drop` (land removed) or `unclaimed` (Unclaimed land: drawn, never a place) |
| `carve.json` | places cut out of an NE feature. `source: "breakaway"`: the breakaway layer's `brkA3` polygon is erased from `from` and becomes the place; `from` keeps its own ruling. `source: "split"`: the parts of `from` inside `bbox` become the place; every part of `from` must fall in exactly one split's bbox |
| `patches/*.geojson` | hand-drawn geometry: each feature `{ id, cut? }` replaces the land of place `id` and is erased from the places in `cut` |

Ids are NE's `ADM0_A3`. Carved breakaways use their NE `BRK_A3` (`B35` Abkhazia, `B36` Transnistria, `B37` South Ossetia); NE's `IOA` is split into `CXR` and `CCK`.

### Shipped files (`public/data/`)

All sorted by id.

| File | Shape |
|---|---|
| `map-sovereign.geojson`, `map-defacto.geojson`, `map-dependencies.geojson` | one map per tier: polygons, one feature per place of the tier plus Unclaimed land, `{ id, unclaimed? }`; one feature per line. 200 / 206 / 248 features |
| `places.json` | array, one place per line: `{ id, qid, iso2?, tier, holder?, region, bbox, ease, neighbours, microstate }`; `neighbours` and `microstate` each as `{ sovereign, defacto, dependencies }` |
| `points.geojson` | one point per place (245), `{ id, speckZoom }`; one feature per line. The app filters them by tier |
| `version.json` | `{ ne, counts: { sovereign, defacto, dependencies } }`; counts are places per `tier` value. One file covers all three maps |

In a tier's map, the land of each place outside the tier is part of the place its holder chain ends in (a place's holder, or the holder's holder, until one is in the tier): dependencies sit in their sovereign in the de facto and sovereign maps, and de facto places in their parent state in the sovereign map. Ids are the same in every map; Unclaimed land and the merges in `features.json` are the same in every map. Only the holders are dissolved again, so every other feature is byte-identical across the three maps.

`bbox` is `[west, south, east, north]` from the place's own land in the dependencies map, in every tier (Denmark's frames Denmark, not Greenland). Its longitudes are the narrowest span that covers all its polygons: for a place across the antimeridian (Russia, the USA, Fiji, Kiribati, New Zealand, US Minor Outlying Islands) `west` is greater than `east`.

`neighbours` and `microstate` are computed per tier from that tier's map, because merged land changes them: in the sovereign map Gibraltar's land makes Spain and the UK neighbours, and Western Sahara's makes Morocco and Mauritania neighbours. A place outside a tier has no land of its own in that tier's map, so its `neighbours` there are `[]` and its `microstate` is `false`.

- `neighbours`: the sorted ids of the places that share at least one border segment with it (the same vertices in the same pair, which is what mapshaper's shared arcs are). A touch at a single point is not a border (Namibia–Zimbabwe, Zambia–Botswana), and Unclaimed land is nobody's neighbour. NE 10m leaves a gap between Macao and China (about 650 m raw, 90 m after simplifying), so the build bridges it: they are neighbours in every map that draws both, and the build stops with an error if the gap ever grows beyond 1 km. 319 / 330 / 332 pairs (sovereign / de facto / dependencies).
- `microstate`: the place's largest single piece of land is below 2,500 km² (spherical area, holes subtracted). 29 / 29 / 65 places. The nearest on either side are Mauritius (1,834 km², a microstate) and Luxembourg (2,614 km², not). The Vatican is a triangle of 0.28 km² after simplifying (real: 0.44 km²); either is far below the threshold.
- `ease`: rank by NE `POP_EST`, 1 for the most populous; ties go by id. The five places without an NE feature of their own (Abkhazia `B35`, Transnistria `B36`, South Ossetia `B37`, Cocos Islands `CCK`, Christmas Island `CXR`) have no figure and rank last, 241–245.
- `speckZoom` (in `points.geojson`): the zoom from which the place's largest piece of own land (dependencies map) is drawn at least 2 px wide, measured as the side of a square of the same area on a 512 px Web Mercator map at the point's latitude, rounded up to 0.1. Below that zoom the app draws a 2 px speck at the point; from it on, the place's own polygon is big enough. Large places get a negative `speckZoom`. The point is mapshaper's inner point of that largest piece, so a speck always sits on the place's land. 94 places have a `speckZoom` above 0; the Vatican's is the highest at 7.8.

## Build steps

Step numbers follow the spec; step 6 doesn't compute mainland neighbours or island-chain outlines yet, and step 10 (silhouette sheet) is not built yet.

1. **Load** (`steps/load.ts`): read both NE files from the cache and verify their sha256.
2. **Rule** (`steps/rule.ts`): erase the breakaways from their host, apply `features.json`, split `IOA`. Each place keeps NE's QID and ISO code (`ISO_A2_EH` for countries, `ISO_A2` for breakaways; a split inherits neither) and the M49 fields of the feature its land comes from.
3. **Patch** (`steps/patch.ts`): apply `patches/` (Vatican City and the matching hole in Italy), before simplifying, so the patch is simplified like everything else.
4. **Simplify** (`steps/simplify.ts`): explode each place into islands, simplify 14% with `keep-shapes`, dissolve per id, precision 0.001. Without the explode step only one ring per place survives. The result is the dependencies map.
5. **Dissolve** (`steps/dissolve.ts`): for the sovereign and de facto maps, relabel each place outside the tier with the end of its holder chain (from `places.json`) and dissolve the holders, precision 0.001. A broken chain leaves the land under its own id, and the check fails on it.
6. **Compute** (`steps/compute.ts`): each place's `bbox` from the dependencies map. Then (`steps/borders.ts`, `steps/tier-facts.ts`) per tier: the pieces of land in the tier's map and which pieces share a border segment, with the Macao–China gap bridged; `neighbours` and `microstate` from them. `steps/specks.ts`: the speck point and `speckZoom` from the dependencies map. `steps/ease.ts`: the ease rank.
7. **Join** (`steps/join.ts`): tier and holder from `places.json`, `bbox` from step 6; QID, ISO code and region from the curated override, else from NE. The default region comes from NE's UN M49 fields: North America = Northern America + Central America + Caribbean; NE's "Seven seas (open ocean)" gives no region, so those places carry an override.
8. **Check** (`check.ts`): see below. A failure stops the build before anything is written.
9. **Write** (`steps/write.ts`): write the shipped files sorted by id, and print their sizes.

A broken reference in the curated files (a merge into a non-place, a carve whose `from` or `brkA3` doesn't exist, a split bbox that holds no part, a patch for an id without land) stops the build with an error at the step that meets it.

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

## Updating Natural Earth

Bump `naturalEarthRelease` and both sha256 values in `scripts/data/sources/natural-earth.ts`, run `npm run data:fetch -- --ne`, then `npm run data:build`. The build fails on anything unruled; rule it in `data/curated/`, rebuild, and review the diff of `public/data/`.
