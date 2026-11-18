# Terra Incognita

Geography quiz games played on a world map.

- [Data pipeline](docs/data-pipeline.md): how the place data in `public/data/` is fetched, ruled, checked and built.
- [Daily draw](docs/daily-draw.md): how the daily challenge draws the same 10 places for everyone on a Berlin date, and how the draw is versioned.

## How it was made

Terra Incognita was built with AI assistance, in three steps:

1. Wayfinder map: a planning map that turned the idea's open questions into decisions, one research, prototype or grilling ticket at a time. It is a planning tool, unrelated to the game's Wayfinder mode.
2. Spec: synthesised from the map's decisions.
3. Tickets: the spec split into implementation tickets, worked one by one in Chartroom, a self-hosted issue tracker.
