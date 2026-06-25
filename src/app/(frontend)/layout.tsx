import type { Metadata } from 'next';
import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import CookieConsent from '@/components/CookieConsent';
import { BRAND_LAYER, ORG_LEGAL_NAME, SITE_URL, TAGLINE } from '@/lib/seo';
import { buildMoreskaCreativeWorkJsonLd } from '@/lib/dance-schema';
import { bodoni, ibmPlexMono, inter } from './fonts';
import '../globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `Moreška Korčula - Sword Dance Tickets | ${BRAND_LAYER}`,
  description: TAGLINE,
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: ORG_LEGAL_NAME,
  alternateName: BRAND_LAYER,
  foundingDate: '1883',
  url: SITE_URL,
  logo: `${SITE_URL}/cecilija-logo.webp`,
  slogan: TAGLINE,
  email: 'info@moreska.eu',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Korčula',
    addressCountry: 'HR',
  },
  areaServed: {
    '@type': 'Place',
    name: 'Korčula, Croatia',
  },
  // Topics this 143-year-old institution is authoritative on — helps AI answer
  // engines attach these subjects to the entity (docs/geo-strategy.md §4.1).
  knowsAbout: [
    'Moreška',
    'sword dance',
    'Korčula cultural heritage',
    'klapa singing',
    'wind orchestra',
  ],
  // Only verified, real profiles. Do NOT fabricate sameAs URLs — an LLM that
  // follows a dead link loses trust in the whole entity.
  // Found in the repo: TripAdvisor (already), Facebook + Instagram (Footer.tsx).
  // TODO(geo): add sameAs — YouTube URL pending from HGD (Footer link is a "#" placeholder).
  // TODO(geo): add sameAs — Google Business Profile (Maps place) URL pending from HGD.
  // TODO(geo): add sameAs — Wikipedia article URL pending (§4.3 off-site workstream).
  // TODO(geo): add sameAs — Wikidata item URL pending (§4.3 off-site workstream).
  sameAs: [
    'https://www.tripadvisor.com/Attraction_Review-g1007309-d1898279.html',
    'https://www.facebook.com/svcecilijamoreska',
    'https://www.instagram.com/hgdsvetacecilija/',
  ],
};

// Dedicated entity for the dance itself (CreativeWork) — see dance-schema.ts.
const moreskaJsonLd = buildMoreskaCreativeWorkJsonLd();

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <html
      lang={locale}
      className={`${bodoni.variable} ${ibmPlexMono.variable} ${inter.variable}`}
    >
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(moreskaJsonLd) }}
        />
        {children}
        <CookieConsent t={dict.cookieBanner} />
      </body>
    </html>
  );
}
