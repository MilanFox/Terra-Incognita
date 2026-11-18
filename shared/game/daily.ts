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
