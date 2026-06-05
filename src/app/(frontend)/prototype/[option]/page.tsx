// PROTOTYPE — homepage rendered with one of two designer font options.
// /prototype/option1 (Primary) · /prototype/option2 (Secondary).
// Mirrors src/app/(frontend)/page.tsx exactly; the only difference is the
// font CSS variables remapped on the wrapper. Throwaway — delete once a
// font system is chosen and folded into the real layout.
import { notFound } from 'next/navigation';
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
import { PROTOTYPE_FONTS, type PrototypeOption } from '../fonts';
import PrototypeBar from '../PrototypeBar';

export const dynamic = 'force-dynamic';

export default async function PrototypeHomePage({
  params,
}: {
  params: Promise<{ option: string }>;
}) {
  const { option } = await params;
  if (option !== 'option1' && option !== 'option2') notFound();
  const opt = option as PrototypeOption;
  const recipe = PROTOTYPE_FONTS[opt];

  const locale = await getLocale();
  const [dict, upcoming] = await Promise.all([
    getDictionary(locale),
    getUpcomingShows(4),
  ]);

  return (
    <div className={`${recipe.classes.join(' ')} hp t-stone`}>
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
      <PrototypeBar current={opt} recipe={recipe} />
    </div>
  );
}
