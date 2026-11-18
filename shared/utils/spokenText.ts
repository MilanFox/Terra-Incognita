export const withoutDoubledFullStops = (text: string) => text.replace(/(?<!\.)\.\.(?!\.)/g, '.');
