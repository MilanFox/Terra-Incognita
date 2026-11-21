export type LetterRows = [string, string, string];

const letterRowsByLocale: Record<string, LetterRows> = {
  en: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  de: ['qwertzuiopü', 'asdfghjklöä', 'yxcvbnm'],
};

export const letterRowsFor = (locale: string): LetterRows => letterRowsByLocale[locale] ?? letterRowsByLocale.en!;
