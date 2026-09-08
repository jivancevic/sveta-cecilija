import type { Metadata } from 'next'
import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'
import { ForgotForm } from './ForgotForm'

// /app/forgot — "Zaboravljena lozinka" (#424, #419 story 23).
//
// A page rather than an inline form on the login screen: the answer is a
// sentence about mail, not a sign-in, and mixing the two on one screen would
// leave the dancer unsure which button they just pressed.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.forgot.title} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  return (
    <main className="app__panel">
      <h1>{APP_STRINGS.forgot.title}</h1>
      <p>{APP_STRINGS.forgot.intro}</p>
      <ForgotForm />
      <p className="app__aside">
        <Link className="app__link" href="/app/login">
          {APP_STRINGS.forgot.backToLogin}
        </Link>
      </p>
    </main>
  )
}
