import type { Metadata } from 'next';
import { Bodoni_Moda_SC, IBM_Plex_Mono, Inter } from 'next/font/google';
import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import CookieConsent from '@/components/CookieConsent';
import './globals.css';

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
  title: 'HGD Sveta Cecilija — Moreška Korčula',
  description:
    'The home of Moreška — Europe\'s last authentic war dance. Performances at the Summer Cinema, Korčula. Tickets, history, and private bookings.',
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
        {children}
        <CookieConsent t={dict.cookieBanner} />
      </body>
    </html>
  );
}
