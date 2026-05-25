import type { Metadata } from 'next';
import { Bodoni_Moda_SC, IBM_Plex_Mono, Inter } from 'next/font/google';
import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import CookieConsent from '@/components/CookieConsent';
import { BRAND_LAYER, ORG_LEGAL_NAME, SITE_URL, TAGLINE } from '@/lib/seo';
import '../globals.css';

const bodoniModa = Bodoni_Moda_SC({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-bodoni',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `Moreška Korčula — Sword Dance Tickets | ${BRAND_LAYER}`,
  description: TAGLINE,
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: ORG_LEGAL_NAME,
  alternateName: BRAND_LAYER,
  foundingDate: '1883',
  url: SITE_URL,
  logo: `${SITE_URL}/cecilija-logo.png`,
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
      className={`${bodoniModa.variable} ${ibmPlexMono.variable} ${inter.variable}`}
    >
      <body>
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
