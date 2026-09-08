import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { resolveAppViewer } from '@/lib/app/viewer'
import { LoginForm } from './LoginForm'

// /app/login — the Moreškant app's own sign-in (#421).
//
// Never /admin/login: a dancer has no business in the Payload shell, and the
// cookie the form's route sets is the same one either page would set.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.login.title} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default async function MoreskantLoginPage() {
  // Already signed in and on the roster: skip the form. A signed-in account
  // that is NOT on the roster stays here, so it can sign in as someone else
  // rather than bounce between two pages it may not read.
  const viewer = await resolveAppViewer()
  if (viewer.signedIn && viewer.access.kind !== 'denied') redirect('/app')

  return (
    <main className="app__panel">
      <h1>{APP_STRINGS.name}</h1>
      <p>{APP_STRINGS.login.intro}</p>
      <LoginForm />
    </main>
  )
}
