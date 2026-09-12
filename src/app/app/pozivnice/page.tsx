import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { accessMember } from '@/lib/app/access'
import { getInviteCandidates } from '@/lib/app/invite-list-data'
import { APP_STRINGS } from '@/lib/app/strings'
import { resolveAppViewer } from '@/lib/app/viewer'
import { AppShell } from '../AppShell'
import { DeniedPage } from '../DeniedPage'
import { InviteList } from './InviteList'

// `/app/pozivnice` — the voditelj's invitations screen (#463).
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

export default async function PozivnicePage() {
  const viewer = await resolveAppViewer()
  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') return <DeniedPage />
  if (viewer.access.kind !== 'voditelj') redirect('/app')

  const candidates = await getInviteCandidates()

  return (
    <AppShell me={accessMember(viewer.access)}>
      <Link className="app__back" href="/app/vise">
        ‹ {APP_STRINGS.tabs.more}
      </Link>
      <h2 className="app__page-title">{APP_STRINGS.inviteLink.title}</h2>
      <p className="app__comp-intro">{APP_STRINGS.inviteLink.intro}</p>
      {/* The one sentence that decides whether the dancer can install the app
          at all: a messenger opens the link in its own webview, where there is
          no "Add to Home Screen" (#455). */}
      <p className="app__invite-hint">{APP_STRINGS.inviteLink.channelHint}</p>

      <InviteList candidates={candidates} />
    </AppShell>
  )
}
