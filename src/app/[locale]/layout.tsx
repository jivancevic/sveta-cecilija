import type { Metadata } from 'next';
import { Bodoni_Moda_SC, IBM_Plex_Mono, Inter } from 'next/font/google';
import { locales, type Locale } from '@/proxy';
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

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: 'HGD Sveta Cecilija — Moreška Korčula',
  description:
    'The home of Moreška — Europe\'s last authentic war dance. Performances at the Summer Cinema, Korčula. Tickets, history, and private bookings.',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (locales.includes(rawLocale as Locale) ? rawLocale : 'en') as Locale;

  return (
    <html
      lang={locale}
      className={`${bodoniModa.variable} ${ibmPlexMono.variable} ${inter.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
