# Daily draw

Every player gets the same 10 places for the daily challenge on a Berlin calendar date, without a server: the deck is drawn on the device by a seeded PRNG from the shipped place data. The code is `shared/game/daily.ts`; the game core calls it when a daily round starts.

**Current version: 1.**

## Version 1

### Date

The date is the calendar date in `Europe/Berlin` at the moment the round starts, written `YYYY-MM-DD` (for example `2026-11-18`). It comes from `Intl.DateTimeFormat` with `timeZone: 'Europe/Berlin'`, so it works offline and follows Berlin's summer time, never the device's time zone. A new date, and with it a new daily, starts at Berlin midnight: 23:00 UTC in winter, 22:00 UTC in summer.

### Pool

The pool of Find on the map, whole world, sovereign tier, by flag: every place in `public/data/places.json` with `tier: "sovereign"` and a flag. The by-flag pool is the by-name pool minus flagless places, so both variants draw the same places. Today that is all 197 sovereign places.

The pool is sorted by id with the default JavaScript string sort (UTF-16 code units; the ids are upper-case ASCII, so this is alphabetical). The shipped file is already sorted by id (data pipeline step 9); the draw sorts again so it never depends on file order.

### Seed

FNV-1a, 32 bit, over the character codes of the date string:

```
hash = 0x811c9dc5
for each character c of the date: hash = imul(hash XOR charCode(c), 0x01000193)
seed = hash as an unsigned 32-bit integer
```

### PRNG

mulberry32, seeded with the seed above. Each call returns a number in [0, 1):

```
state = (state + 0x6d2b79f5) as int32
t = imul(state XOR (state >>> 15), 1 OR state)
t = (t + imul(t XOR (t >>> 7), 61 OR t)) XOR t
return ((t XOR (t >>> 14)) >>> 0) / 2^32
```

### Draw

A partial Fisher–Yates shuffle from the front of the sorted pool of size `n`:

```
for i = 0 to 9:
  j = i + floor(random() * (n - i))
  swap pool[i] and pool[j]
deck = pool[0..9]
```

The deck is the first 10 places in that order, and the prompts are asked in that order. A pool under 10 places would shrink the deck to the pool.

### Test vector

`2026-11-18` draws `LSO BEL LKA CRI BOL RWA MMR CYP LUX KGZ`. The game-core tests pin this deck, so a change to any step above fails them.

## Not version-proof

By choice (D15), the draw reads the current data. A data version that adds, removes, re-tiers or renames the id of a sovereign place, or takes away a sovereign place's flag, changes the deck for every date from then on, and players on different app versions can get different dailies on the day it ships. Daily records already stored are never touched.

## Changing the draw

Any change to the date, the pool, the seed, the PRNG or the draw is a breaking change: everyone's daily changes, and on the day the change ships players on the old and new app play different places. If it has to happen:

1. Add a new version section here and keep the old one.
2. Bump the version at the top.
3. Update the test vector here and in `shared/game/game.test.ts`.
