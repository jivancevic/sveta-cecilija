import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Scan ticket — HGD Sveta Cecilija',
  robots: { index: false, follow: false },
}

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
