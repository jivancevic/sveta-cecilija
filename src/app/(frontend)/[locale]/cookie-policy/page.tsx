import { locales, type Locale } from '@/proxy';
import { getDictionary } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function CookiePolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (locales.includes(rawLocale as Locale) ? rawLocale : 'en') as Locale;
  const dict = await getDictionary(locale);

  return (
    <LegalPage
      locale={locale}
      dict={dict}
      page={dict.cookiePage}
      heroImage="/klapa-todor.webp"
    />
  );
}
