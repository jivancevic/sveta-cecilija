import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import {
  HISTORY_VIGNETTES_HOME,
  SECTION_CARDS_META,
  SERVICE_CARDS_META,
} from '@/lib/data';
import { getUpcomingShows } from '@/lib/shows';
import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import About from '@/components/About';
import Schedule from '@/components/Schedule';
import History from '@/components/History';
import Sections from '@/components/Sections';
import Services from '@/components/Services';
import Contact from '@/components/Contact';
import Footer from '@/components/Footer';
import ScrollReveal from '@/components/ScrollReveal';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata() {
  return buildMetadata({
    title: 'Moreška Korčula — Sword Dance Tickets',
    description:
      'The Original Moreška sword dance, performed since 1883. Live performances at the Summer Cinema, Korčula. Book your tickets online.',
    path: '/',
  });
}

export default async function HomePage() {
  const locale = await getLocale();
  const [dict, upcoming] = await Promise.all([
    getDictionary(locale),
    getUpcomingShows(4),
  ]);

  return (
    <div className="hp t-stone">
      <Nav locale={locale} t={dict.nav} variant="homepage" />
      <Hero t={dict.hero} />
      <About t={dict.about} />
      <Schedule t={dict.schedule} shows={upcoming} locale={locale} />
      <History t={dict.history} vignettes={HISTORY_VIGNETTES_HOME} />
      <Sections t={dict.sections} cards={SECTION_CARDS_META} />
      <Services t={dict.services} cards={SERVICE_CARDS_META} />
      <Contact t={dict.contact} />
      <Footer locale={locale} t={dict.footer} />
      <ScrollReveal />
    </div>
  );
}
