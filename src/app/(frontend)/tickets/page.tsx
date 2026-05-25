import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import { getUpcomingShows } from '@/lib/shows';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PerformancesPage from '@/components/PerformancesPage';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata() {
  return buildMetadata({
    title: 'Moreška Tickets — 2026 Season Schedule',
    description:
      "Buy tickets for Korčula's Moreška sword dance, performed since 1883. Full 2026 season at the Summer Cinema. Adults €20, children €10.",
    path: '/tickets',
  });
}

// Landscape-only pool; portrait shots would crop badly in the 3:2 card frame.
const SHOW_IMAGE_POOL = [
  '/moreska-wide.webp',
  '/kraljevi-krupni.webp',
  '/moreska01.webp',
  '/kraljevi.webp',
  '/moreska02.webp',
  '/black-king-moreska.webp',
  '/fila.webp',
  '/black-bula.webp',
  '/bula-alone.webp',
  '/kings-face-off.webp',
  '/mate.webp',
  '/sfida-wide.webp',
  '/sword-clash.webp',
  '/top-3-kolap.webp',
  '/top-7-kolap.webp',
  '/top-end-kolap.webp',
  '/top-end.webp',
  '/wave.webp',
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default async function PerformancesRoute({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const locale = await getLocale();
  const { date: initialDate } = await searchParams;
  const [dict, shows] = await Promise.all([
    getDictionary(locale),
    getUpcomingShows(),
  ]);

  // Shuffle once on the server per request; the same array hydrates the client.
  const images = shuffle(SHOW_IMAGE_POOL);

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />
      <PerformancesPage
        t={dict.performancesPage}
        tSchedule={dict.schedule}
        shows={shows}
        locale={locale}
        initialDate={initialDate}
        images={images}
      />
      <Footer locale={locale} t={dict.footer} />
    </div>
  );
}
