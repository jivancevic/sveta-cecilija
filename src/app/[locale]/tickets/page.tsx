import { locales, type Locale } from '@/proxy';
import { getDictionary } from '@/lib/i18n';
import { SCHEDULE_ALL } from '@/lib/data';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PerformancesPage from '@/components/PerformancesPage';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function PerformancesRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (locales.includes(rawLocale as Locale) ? rawLocale : 'en') as Locale;
  const dict = await getDictionary(locale);

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />
      <PerformancesPage
        t={dict.performancesPage}
        tSchedule={dict.schedule}
        performances={SCHEDULE_ALL}
        locale={locale}
      />
      <Footer locale={locale} t={dict.footer} />
    </div>
  );
}
