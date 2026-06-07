import type { Metadata } from 'next';
import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import CookieConsent from '@/components/CookieConsent';
import { BRAND_LAYER, ORG_LEGAL_NAME, SITE_URL, TAGLINE } from '@/lib/seo';
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
  sameAs: ['https://www.tripadvisor.com/Attraction_Review-g1007309-d1898279.html'],
};

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
        {children}
        <CookieConsent t={dict.cookieBanner} />
      </body>
    </html>
  );
}
