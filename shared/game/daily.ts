export const dailyDeckSize = 10;

const berlinDateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });

export const berlinDateOf = (moment: number) => {
  const parts = Object.fromEntries(berlinDateFormat.formatToParts(moment).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

// Draw version 1 (docs/daily-draw.md): changing the seed, the PRNG or the draw changes every player's daily and is a breaking change.
const dateSeedOf = (date: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < date.length; index += 1) hash = Math.imul(hash ^ date.charCodeAt(index), 0x01000193);
  return hash >>> 0;
};

const seededRandomOf = (seed: number) => {
  let current = seed;
  return () => {
    current = (current + 0x6d2b79f5) | 0;
    let mixed = Math.imul(current ^ (current >>> 15), 1 | current);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

export const drawDaily = (poolIds: readonly string[], date: string) => {
  const random = seededRandomOf(dateSeedOf(date));
  const deck = [...poolIds].sort();
  const drawCount = Math.min(dailyDeckSize, deck.length);
  for (let index = 0; index < drawCount; index += 1) {
    const swapIndex = index + Math.floor(random() * (deck.length - index));
    [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
  }
  return deck.slice(0, drawCount);
};

const dayMs = 86_400_000;

const shiftedDateOf = (date: string, days: number) => new Date(Date.parse(date) + days * dayMs).toISOString().slice(0, 10);

export interface Streak {
  current: number
  longest: number
}

export const streakOf = (completeDates: ReadonlySet<string>, today: string): Streak => {
  let current = 0;
  let date = completeDates.has(today) ? today : shiftedDateOf(today, -1);
  while (completeDates.has(date)) {
    current += 1;
    date = shiftedDateOf(date, -1);
  }
  let longest = 0;
  for (const start of completeDates) {
    if (completeDates.has(shiftedDateOf(start, -1))) continue;
    let length = 0;
    while (completeDates.has(shiftedDateOf(start, length))) length += 1;
    longest = Math.max(longest, length);
  }
  return { current, longest };
};

export const nextBerlinMidnightOf = (moment: number) => {
  const today = berlinDateOf(moment);
  let before = moment;
  let after = moment + dayMs * 1.5;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (berlinDateOf(middle) === today) before = middle;
    else after = middle;
  }
  return after;
};
