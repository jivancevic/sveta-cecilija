import { headers } from 'next/headers';
import type { Locale } from '@/proxy';

export async function getLocale(): Promise<Locale> {
  const h = await headers();
  return (h.get('x-locale') as Locale) ?? 'en';
}
