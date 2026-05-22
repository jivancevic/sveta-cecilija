import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import { SCHEDULE_ALL } from '@/lib/data';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PerformancesPage from '@/components/PerformancesPage';

export default async function PerformancesRoute({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const locale = await getLocale();
  const { date: initialDate } = await searchParams;
  const dict = await getDictionary(locale);

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />
      <PerformancesPage
        t={dict.performancesPage}
        tSchedule={dict.schedule}
        performances={SCHEDULE_ALL}
        locale={locale}
        initialDate={initialDate}
      />
      <Footer locale={locale} t={dict.footer} />
    </div>
  );
}
