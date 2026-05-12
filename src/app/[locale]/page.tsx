import { locales, type Locale } from '@/proxy';
import { getDictionary } from '@/lib/i18n';
import {
  getUpcomingPerformances,
  HISTORY_VIGNETTES_HOME,
  SECTION_CARDS_META,
  SERVICE_CARDS_META,
} from '@/lib/data';
import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import GoldDivider from '@/components/GoldDivider';
import About from '@/components/About';
import Schedule from '@/components/Schedule';
import History from '@/components/History';
import Sections from '@/components/Sections';
import Services from '@/components/Services';
import Contact from '@/components/Contact';
import Footer from '@/components/Footer';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (locales.includes(rawLocale as Locale) ? rawLocale : 'en') as Locale;
  const dict = await getDictionary(locale);
  const upcoming = getUpcomingPerformances(4);

  return (
    <div className="hp t-stone">
      <Nav locale={locale} t={dict.nav} variant="homepage" />
      <Hero t={dict.hero} />
      <GoldDivider />
      <About t={dict.about} locale={locale} />
      <Schedule t={dict.schedule} performances={upcoming} locale={locale} />
      <History t={dict.history} vignettes={HISTORY_VIGNETTES_HOME} />
      <Sections t={dict.sections} cards={SECTION_CARDS_META} />
      <Services t={dict.services} cards={SERVICE_CARDS_META} />
      <Contact t={dict.contact} />
      <Footer locale={locale} t={dict.footer} />
    </div>
  );
}
