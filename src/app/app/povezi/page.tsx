import Link from 'next/link'
import { redirect } from 'next/navigation'
import { accessMember } from '@/lib/app/access'
import { getSelfLinkCandidates } from '@/lib/app/link-self-data'
import { APP_STRINGS } from '@/lib/app/strings'
import { resolveAppViewer } from '@/lib/app/viewer'
import { AppShell } from '../AppShell'
import { DeniedPage } from '../DeniedPage'
import { LinkSelfList } from './LinkSelfList'

// `/app/povezi` — "Poveži svoj račun s članom" (#462).
//
// A voditelj who also dances arrives here from the hero, where their two answer
// buttons are missing, or from Više. Everybody else is sent back to `/app`:
//
//  - a moreškant already has a link, by construction — their login was issued
//    by the invitation, which sets it (#424);
//  - a voditelj whose link is already set has nothing to choose. Repointing it
//    is a `users` job and the route refuses it, so the screen says so rather
//    than offering a list whose every tap is a 409.
//
// The list is the eligible roster and nothing else, which is the same rule the
// POST re-applies (`memberEligibility`): a dancer who already has an account
// never appears, because linking to them would be taking over their identity
// rather than filling in a blank.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function PoveziPage() {
  const viewer = await resolveAppViewer()
  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') return <DeniedPage />
  if (viewer.access.kind !== 'voditelj') redirect('/app')

  const me = accessMember(viewer.access)

  if (viewer.memberLinkId !== null) {
    return (
      <AppShell me={me}>
        <Link className="app__back" href="/app">
          ‹ {APP_STRINGS.detail.back}
        </Link>
        <h2 className="app__page-title">{APP_STRINGS.linkSelf.title}</h2>
        <div className="app__empty-state">{APP_STRINGS.linkSelf.alreadyLinked}</div>
      </AppShell>
    )
  }

  const candidates = await getSelfLinkCandidates()

  return (
    <AppShell me={me}>
      <Link className="app__back" href="/app">
        ‹ {APP_STRINGS.detail.back}
      </Link>
      <h2 className="app__page-title">{APP_STRINGS.linkSelf.title}</h2>
      <p className="app__comp-intro">{APP_STRINGS.linkSelf.intro}</p>

      {candidates.length === 0 ? (
        <div className="app__empty-state">{APP_STRINGS.linkSelf.empty}</div>
      ) : (
        <LinkSelfList candidates={candidates} />
      )}
    </AppShell>
  )
}
