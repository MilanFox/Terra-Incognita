import { fetchText, writeSnapshots } from './snapshot.ts';

export const mledozeCommit = 'fa4f62182d19ff4f8b325cde6387c9cd9d80955a';
export const mledozeSnapshotName = 'mledoze-alias-subset.json';

export type MledozeCountry = {
  cca2: string
  cca3: string
  name: { common: string, official: string }
  altSpellings: string[]
  translations: { deu?: { common: string, official: string } }
  capital: string[]
};

export const fetchMledoze = async () => {
  console.log(`mledoze/countries @ ${mledozeCommit.slice(0, 7)}`);
  const countries: MledozeCountry[] = JSON.parse(await fetchText(
    `https://raw.githubusercontent.com/mledoze/countries/${mledozeCommit}/countries.json`,
  ));
  const subset = countries
    .map(({ cca2, cca3, name, altSpellings, translations, capital }): MledozeCountry => ({
      cca2,
      cca3,
      name: { common: name.common, official: name.official },
      altSpellings,
      translations: translations.deu ? { deu: translations.deu } : {},
      capital,
    }))
    .sort((first, second) => first.cca3.localeCompare(second.cca3));
  const lines = subset.map(country => JSON.stringify(country)).join(',\n');
  writeSnapshots('mledoze', { [mledozeSnapshotName]: `[\n${lines}\n]\n` }, { commit: mledozeCommit });
};
