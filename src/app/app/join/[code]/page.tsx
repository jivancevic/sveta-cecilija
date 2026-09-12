import type { Metadata } from 'next'
import { getJoinCandidates, joinCodeIsLive } from '@/lib/app/join-data'
import { normalizeJoinCode } from '@/lib/app/join'
import { APP_STRINGS } from '@/lib/app/strings'
import { JoinClaim } from './JoinClaim'

// /app/join/<kod> — the rehearsal QR (#463).
//
// PUBLIC, like `/app/install` and for the same reason: the person scanning
// it has no login yet, which is the entire problem being solved. Unlike that
// page it WRITES, so everything about it is built to be boring to an outsider:
//
//  - the code is short-lived, rotatable and dead by morning;
//  - the list is names only. No mobile, no e-mail, no roles, no attendance
//    (`getJoinCandidates` is where that projection is stated);
//  - a tap creates a REQUEST, not an account. A voditelj in the room approves
//    it, and until they do nothing exists;
//  - the POST behind it is throttled per code and per IP, with the per-IP
//    budget sized for a hall of dancers behind one NAT
//    (`join-rate-limit.ts`).
//
// A dead code renders the same sentence a wrong one does, and neither lists
// anybody: the roster is not something a stale QR photo hands over.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.join.title} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

/** A path segment that is not valid percent-encoding is simply not a code. */
function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return ''
  }
}

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params
  const code = normalizeJoinCode(decodeSegment(raw ?? ''))

  const live = code ? await joinCodeIsLive(code) : false
  if (!live) {
    return (
      <main className="app__panel">
        <h1>{APP_STRINGS.name}</h1>
        <p className="app__error" role="alert">
          {APP_STRINGS.join.badCode}
        </p>
      </main>
    )
  }

  const candidates = await getJoinCandidates()

  return (
    <main className="app__panel">
      <h1>{APP_STRINGS.join.title}</h1>
      <p>{APP_STRINGS.join.intro}</p>
      <JoinClaim code={code} candidates={candidates} />
    </main>
  )
}
