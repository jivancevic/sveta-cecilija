import type { Metadata } from 'next'
import Link from 'next/link'
import QRCode from 'qrcode'
import { getInviteCandidates } from '@/lib/app/invite-list-data'
import { getCurrentJoinCode, getPendingJoinClaims } from '@/lib/app/join-data'
import { formatDateTimeHr } from '@/lib/app/join'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../AppShell'
import { DeniedPage } from '../DeniedPage'
import { openScreen } from '../gate'
import { InviteList } from './InviteList'
import { JoinCodeCard } from './JoinCodeCard'
import { PendingClaims } from './PendingClaims'

// `/app/invitations` — the voditelj's invitations screen (#463).
//
// Getting a dancer onto the roster used to mean opening `/admin` on a laptop,
// finding the Member, typing an e-mail address they usually do not have, and
// pressing a button. This is the same job on the phone the voditelj is already
// holding at a rehearsal: tap a name, read the message, send it by SMS.
//
// Voditelj only (`moreska`), and the route it posts to re-checks that itself:
// the screen is UX, never the boundary.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.inviteLink.title} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default async function InvitationsPage() {
  const { viewer, refusal } = await openScreen()
  if (refusal) return refusal
  // A row under Više rather than a screen of its own, so the table cannot
  // refuse it: the page does, with the same panel a wrong route gets (#473).
  // Never a silent redirect — a dancer who was sent this link should read why
  // it is not for them, not find themselves somewhere else.
  if (!viewer.voditelj) {
    return <DeniedPage landing={viewer.nav.landing} dev={viewer.permissions.includes('dev')} />
  }

  const [candidates, joinCode, pending] = await Promise.all([
    getInviteCandidates(),
    getCurrentJoinCode(),
    getPendingJoinClaims(),
  ])

  // The QR is a picture of a server fact, so the server draws it. `unoptimized`
  // on the <Image> side: a data URL has nothing for the optimizer to fetch.
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '')
  const joinUrl = joinCode && base ? `${base}/app/join/${joinCode.code}` : null
  const qr = joinUrl ? await QRCode.toDataURL(joinUrl, { margin: 1, width: 440 }) : null

  return (
    <AppShell viewer={viewer} screen="more" title={APP_STRINGS.inviteLink.title}>
      <Link className="app__back" href="/app/more">
        ‹ {APP_STRINGS.screens.more}
      </Link>
      <h2 className="app__page-title">{APP_STRINGS.inviteLink.title}</h2>

      {/* The rehearsal half first: it is the one thing on this screen that is
          done standing in a room, and the queue under it is what a voditelj
          comes back to the page for. */}
      <JoinCodeCard
        code={joinCode?.code ?? null}
        validUntil={joinCode ? formatDateTimeHr(joinCode.expiresAt) : null}
        url={joinUrl}
        qr={qr}
      />
      <PendingClaims claims={pending} />

      <h2 className="app__month-head">
        <span>{APP_STRINGS.inviteLink.listTitle}</span>
      </h2>
      <p className="app__comp-intro">{APP_STRINGS.inviteLink.intro}</p>
      {/* The one sentence that decides whether the dancer can install the app
          at all: a messenger opens the link in its own webview, where there is
          no "Add to Home Screen" (#455). */}
      <p className="app__invite-hint">{APP_STRINGS.inviteLink.channelHint}</p>

      <InviteList candidates={candidates} />
    </AppShell>
  )
}
