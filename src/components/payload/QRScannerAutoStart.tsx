'use client'

import { useSearchParams } from 'next/navigation'
import { QRScannerButton } from './QRScannerButton'

// Client-only wrapper that reads ?scan=1 from the URL and forwards it to
// QRScannerButton as autoStart. Kept separate from AdminDashboardView (a
// server component) so the dashboard file stays minimal and merge-friendly.
export function QRScannerAutoStart() {
  const searchParams = useSearchParams()
  const autoStart = searchParams?.get('scan') === '1'
  return <QRScannerButton autoStart={autoStart} />
}
