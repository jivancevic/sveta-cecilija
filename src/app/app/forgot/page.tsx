import type { Metadata } from 'next'
import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'
import { ForgotForm } from './ForgotForm'

// /app/forgot — "Pošalji mi link za prijavu" (#424, #419 story 23; #463).
//
// A page rather than an inline form on the login screen: the answer is a
// sentence about mail, not a sign-in, and mixing the two on one screen would
// leave the dancer unsure which button they just pressed.
//
// The route and the URL are still the "zaboravljena lozinka" ones, because the
// token, the throttle and the deliberate silence are unchanged. What arrives is
// not: since #463 the link opens a session instead of asking for a new password
// (`/app/prijava`), so a dancer who never had a password is no longer being
// offered a way to recover one.

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
      {/* The dancer with no e-mail on their Member row is the majority of the
          roster (#463), and this screen is where they would otherwise wait for
          a letter nobody can send. */}
      <p className="app__aside">{APP_STRINGS.forgot.noEmailHint}</p>
      <p className="app__aside">
        <Link className="app__link" href="/app/login">
          {APP_STRINGS.forgot.backToLogin}
        </Link>
      </p>
    </main>
  )
}
