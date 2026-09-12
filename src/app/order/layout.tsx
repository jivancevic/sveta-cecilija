import type { Metadata } from 'next'

// Minimal own-layout for the buyer-facing order pages (self-serve refund,
// ADR-0021), deliberately OUTSIDE the (frontend) route group — same pattern as
// /scan/[token]. No nav/footer/cookie banner: this is a single-purpose landing
// reached only from a signed email link, and must not be indexed.
export const metadata: Metadata = {
  title: 'Your order - HGD Sveta Cecilija',
  robots: { index: false, follow: false },
}

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0 }} suppressHydrationWarning>{children}</body>
    </html>
  )
}
