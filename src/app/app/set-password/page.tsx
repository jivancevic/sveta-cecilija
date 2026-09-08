import type { Metadata } from 'next'
import { APP_STRINGS } from '@/lib/app/strings'
import { SetPasswordForm } from './SetPasswordForm'

// /app/set-password?token=… — where both account mails land (#424).
//
// The invitation and "Zaboravljena lozinka" carry the same link; only the life
// of the token differs (seven days against one hour). The page renders the form
// whatever the token looks like: whether it is live is Payload's answer, given
// on submit, and a "this link is dead" page shown before the dancer has typed
// anything would only be a second place to say it.
//
// A signed-in dancer is deliberately NOT redirected away: changing a password
// while signed in on another device is exactly what the reset mail is for.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.setPassword.title} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params.token
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')

  return (
    <main className="app__panel">
      <h1>{APP_STRINGS.name}</h1>
      <p>{APP_STRINGS.setPassword.intro}</p>
      <SetPasswordForm token={token} />
    </main>
  )
}
