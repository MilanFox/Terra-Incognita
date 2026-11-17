# Data pipeline

The place data the app ships is built from Natural Earth (NE) and the curated rulings in `data/curated/`. Two Node scripts do the work; their outputs in `public/data/` are committed. Vercel never runs the pipeline.

```sh
npm run data:fetch          # network: download the pinned sources (all scopes)
npm run data:fetch -- --ne  # only Natural Earth
npm run data:build          # offline and deterministic: rule, patch, simplify, check, write
```

## Files

| Path | What | In git |
|---|---|---|
| `scripts/data/fetch.ts` | fetch script, one fetcher per scope (`--ne`) | yes |
| `scripts/data/build.ts` | build script, runs the steps below in order | yes |
| `scripts/data/steps/` | one module per build step | yes |
| `scripts/data/check.ts` | the build check | yes |
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
| `places.json` | one entry per place (245): `tier` (`sovereign` \| `defacto` \| `dependencies`), `holder` (the place whose land takes this one in when a tier leaves it out; dependencies and de facto places), and only where needed `region` (overrides the M49 default), `qid` (fixes or supplies the Wikidata QID), `iso2` (supplies the ISO code of a split place), `note` |
| `features.json` | every NE feature that is not a place: `action` `merge` (land joins `into`), `drop` (land removed) or `unclaimed` (Unclaimed land: drawn, never a place) |
| `carve.json` | places cut out of an NE feature. `source: "breakaway"`: the breakaway layer's `brkA3` polygon is erased from `from` and becomes the place; `from` keeps its own ruling. `source: "split"`: the parts of `from` inside `bbox` become the place; every part of `from` must fall in exactly one split's bbox |
| `patches/*.geojson` | hand-drawn geometry: each feature `{ id, cut? }` replaces the land of place `id` and is erased from the places in `cut` |

Ids are NE's `ADM0_A3`. Carved breakaways use their NE `BRK_A3` (`B35` Abkhazia, `B36` Transnistria, `B37` South Ossetia); NE's `IOA` is split into `CXR` and `CCK`.

### Shipped files (`public/data/`)

All sorted by id.

| File | Shape |
|---|---|
| `map-dependencies.geojson` | polygons, one feature per place plus Unclaimed land: `{ id, unclaimed? }`; one feature per line |
| `places.json` | array, one place per line: `{ id, qid, iso2?, tier, holder?, region }` |
| `version.json` | `{ ne, counts: { sovereign, defacto, dependencies } }`; counts are places per `tier` value |

## Build steps

Step numbers follow the spec; steps 5, 6 and 10 (per-tier maps, computed facts, silhouette sheet) are not built yet.

1. **Load** (`steps/load.ts`): read both NE files from the cache and verify their sha256.
2. **Rule** (`steps/rule.ts`): erase the breakaways from their host, apply `features.json`, split `IOA`. Each place keeps NE's QID and ISO code (`ISO_A2_EH` for countries, `ISO_A2` for breakaways; a split inherits neither) and the M49 fields of the feature its land comes from.
3. **Patch** (`steps/patch.ts`): apply `patches/` (Vatican City and the matching hole in Italy), before simplifying, so the patch is simplified like everything else.
4. **Simplify** (`steps/simplify.ts`): explode each place into islands, simplify 14% with `keep-shapes`, dissolve per id, precision 0.001. Without the explode step only one ring per place survives.
7. **Join** (`steps/join.ts`): tier and holder from `places.json`; QID, ISO code and region from the curated override, else from NE. The default region comes from NE's UN M49 fields: North America = Northern America + Central America + Caribbean; NE's "Seven seas (open ocean)" gives no region, so those places carry an override.
8. **Check** (`check.ts`): see below. A failure stops the build before anything is written.
9. **Write** (`steps/write.ts`): write the shipped files sorted by id, and print their sizes.

A broken reference in the curated files (a merge into a non-place, a carve whose `from` or `brkA3` doesn't exist, a split bbox that holds no part, a patch for an id without land) stops the build with an error at the step that meets it.

## Build check

The build fails, and writes nothing, on:

- an NE feature covered by neither `places.json`, `features.json` nor a split in `carve.json`, or covered by more than one of them
- tier counts other than 197 / 6 / 42
- duplicate ids: a key twice in a curated file, a patch id twice, or a carved place reusing an NE feature id
- a place without geometry
- a place without one of the six regions
- a place without a Wikidata QID

## Updating Natural Earth

Bump `naturalEarthRelease` and both sha256 values in `scripts/data/sources/natural-earth.ts`, run `npm run data:fetch -- --ne`, then `npm run data:build`. The build fails on anything unruled; rule it in `data/curated/`, rebuild, and review the diff of `public/data/`.
