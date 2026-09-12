import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { resolveAppViewer } from '@/lib/app/viewer'
import { TokenSignIn } from './TokenSignIn'

// /app/prijava?token=… — where both account mails now land (#463).
//
// The invitation and "Pošalji mi link za prijavu" carry the same link; only the
// life of the token differs (seven days against one hour). Following it lands
// the dancer signed in on `/app`, with no form in between: the password step
// was never what authenticated them, and a dancer who does not want a password
// should not have to invent one to see tonight's evening.
//
// Two things this page deliberately does NOT do:
//
//  - it does not open the session itself. Rendering is a GET, and a GET in a
//    letter is fetched by scanners and preview bots; the session is opened by a
//    POST from the client island below, which they do not make.
//  - it does not judge the token. Whether it is live is Payload's answer, given
//    on that POST, and a "this link is dead" page rendered ahead of the attempt
//    would only be a second place to say it.
//
// Already signed in: straight to `/app`, WITHOUT spending the link. Tapping an
// invitation twice on a phone that is already in is the most ordinary thing in
// the world, and it should not read as an error.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.signIn.title} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default async function SignInWithLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params.token
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')

  const viewer = await resolveAppViewer()
  if (viewer.signedIn && viewer.access.kind !== 'denied') redirect('/app')

  // No token at all: somebody typed the URL, or a mail client truncated it.
  // The password form is the other door and it is one tap away.
  if (!token) redirect('/app/login')

  return (
    <main className="app__panel">
      <h1>{APP_STRINGS.name}</h1>
      <TokenSignIn token={token} />
    </main>
  )
}
