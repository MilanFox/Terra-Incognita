import { fetchNaturalEarth } from './sources/natural-earth.ts';

const fetchers: Record<string, () => Promise<void>> = {
  ne: fetchNaturalEarth,
};

const requested = process.argv.slice(2).map(argument => argument.replace(/^--/, ''));
const unknown = requested.filter(scope => !fetchers[scope]);
if (unknown.length) {
  const scopes = Object.keys(fetchers).map(scope => `--${scope}`).join(', ');
  console.error(`Unknown scope ${unknown.join(', ')}. Scopes: ${scopes}`);
  process.exit(1);
}

for (const scope of requested.length ? requested : Object.keys(fetchers)) await fetchers[scope]?.();
