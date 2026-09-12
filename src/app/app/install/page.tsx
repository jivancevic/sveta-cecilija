import type { Metadata } from 'next'
import { APP_STRINGS } from '@/lib/app/strings'
import { InstallGuide } from './InstallGuide'

// /app/install — the full-screen install guide (#455).
//
// Deliberately NOT behind the access decision: it is the target of the QR code
// a voditelj puts on the wall at a rehearsal, and the person scanning it has
// not signed in yet. There is nothing here but instructions, and the `/app`
// layout already carries `noindex`.

export const metadata: Metadata = {
  title: `${APP_STRINGS.install.guideTitle} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default function InstallGuidePage() {
  return (
    <main className="app__panel">
      <h1>{APP_STRINGS.install.guideTitle}</h1>
      <p>{APP_STRINGS.install.guideIntro}</p>
      <InstallGuide />
    </main>
  )
}
