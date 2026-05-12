import type { Locale } from '@/proxy';

const dictionaries = {
  en: () => import('@/messages/en.json').then((m) => m.default),
  hr: () => import('@/messages/hr.json').then((m) => m.default),
};

export type Dictionary = Awaited<ReturnType<typeof dictionaries.en>>;

export const getDictionary = (locale: Locale): Promise<Dictionary> =>
  dictionaries[locale]();
