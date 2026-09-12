import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { safeAppNextPath } from '@/lib/app/next-path'
import { resolveAppViewer } from '@/lib/app/viewer'
import { LoginForm } from './LoginForm'

// /app/login — Cecilija's own sign-in (#421).
//
// Never /admin/login: a dancer has no business in the Payload shell, and the
// cookie the form's route sets is the same one either page would set.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.login.title} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default async function MoreskantLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Where to land afterwards. `/app` unless a `?next=` names another page of
  // this app — which is how the OAuth consent screen (#438) survives a login:
  // a voditelj arriving from the Claude app comes back to `/app/authorize` with
  // the original parameters instead of losing them. The rule is
  // `safeAppNextPath`, and it is resolved on the SERVER so a hostile value
  // never reaches the browser as a redirect target.
  const params = await searchParams
  const next = safeAppNextPath(Array.isArray(params.next) ? params.next[0] : params.next)

  // Already signed in and on the roster: skip the form. A signed-in account
  // that is NOT on the roster stays here, so it can sign in as someone else
  // rather than bounce between two pages it may not read.
  const viewer = await resolveAppViewer()
  if (viewer.signedIn && viewer.access.kind === 'ok') redirect(next)

  return (
    <main className="app__panel">
      <h1>{APP_STRINGS.name}</h1>
      <p>{APP_STRINGS.login.intro}</p>
      <LoginForm next={next} />
      {/* The way in for a dancer who never set a password, which since #463 is
          most of the roster: the invitation signs them in and the password step
          is optional. It reads as an offer rather than as a recovery, because
          for them nothing was lost. */}
      <p className="app__aside">
        <Link className="app__link" href="/app/forgot">
          {APP_STRINGS.login.magicLink}
        </Link>
      </p>
    </main>
  )
}
