import type { Metadata, Viewport } from 'next'
import { bodoni, ibmPlexMono, inter } from '@/app/(frontend)/fonts'
import { APP_STRINGS } from '@/lib/app/strings'
import './app.css'

// The Moreškant app's own root layout (#421, ADR-0023).
//
// `/app` lives outside `(frontend)` and `(payload)` with its own <html>, the
// way `/scan` does: no public nav, no cookie banner, no Tailwind, no locale
// cookie. Croatian is the only language (ADR-0024, story 33). The brand fonts
// are IMPORTED from the public site's `fonts.ts` rather than redeclared, so
// next/font emits one copy of each face for the whole app.
//
// `robots: noindex` is inherited by every page below this layout, and
// `src/app/sitemap.ts` lists no `/app` URL (asserted in sitemap.test.ts): a
// dancer tool must never surface in search.

export const metadata: Metadata = {
  title: APP_STRINGS.name,
  description: APP_STRINGS.tagline,
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: APP_STRINGS.name, statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#b8881a',
}

export default function MoreskantAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr" className={`${bodoni.variable} ${inter.variable} ${ibmPlexMono.variable}`}>
      <body className="app" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
