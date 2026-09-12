import type { Metadata } from 'next'
import Link from 'next/link'
import { getSelfLinkCandidates } from '@/lib/app/link-self-data'
import { APP_STRINGS } from '@/lib/app/strings'
import { vapidPublicKey } from '@/lib/push/vapid'
import { AppShell, identityLine } from '../AppShell'
import { InstallHint } from '../InstallHint'
import { openScreen } from '../gate'
import { LinkSelfList } from './LinkSelfList'
import { SetPasswordForm } from './SetPasswordForm'

// `/app/account` — "Moj račun" (#473, merging the old `set-password` and
// `povezi` screens).
//
// Everything about the person rather than about the season, on one screen:
// their own record, notifications and install, an optional password, and — for
// a voditelj who dances but whose login carries no Member — the one sanctioned
// way to link it (#462).
//
// The password is OPTIONAL by design (#463): an invitation signs a dancer in
// and a session lasts thirty days, so most of the roster will never set one. It
// sits here rather than on a screen they are sent to, which is the whole point
// of moving it.
//
// Linking is offered only to a voditelj whose RAW link is empty, the same
// condition the route re-applies (#462 review): a moreškant already has a link
// by construction, and an account whose link points at a retired Member would
// be offered a list whose every tap 409s.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.screens.account} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default async function AccountPage() {
  const { viewer, refusal } = await openScreen()
  if (refusal) return refusal

  const me = viewer.me
  const canLinkSelf = viewer.voditelj && viewer.memberLinkId === null
  const candidates = canLinkSelf ? await getSelfLinkCandidates() : []

  return (
    <AppShell viewer={viewer} screen="more" title={APP_STRINGS.screens.account}>
      <Link className="app__back" href="/app/more">
        ‹ {APP_STRINGS.screens.more}
      </Link>

      {me && (
        <section className="app__more-block">
          <h2 className="app__month-head">
            <span>{APP_STRINGS.more.profile}</span>
          </h2>
          <div className="app__more-row app__more-row--static">
            {APP_STRINGS.more.nickname}
            <span>{me.nickname || APP_STRINGS.more.missing}</span>
          </div>
          <div className="app__more-row app__more-row--static">
            {APP_STRINGS.more.roles}
            <span>{identityLine(me)}</span>
          </div>
          <div className="app__more-row app__more-row--static">
            {APP_STRINGS.more.mobile}
            <span>{me.mobile || APP_STRINGS.more.missing}</span>
          </div>
        </section>
      )}

      {/* The heading belongs to the component, not to the page (#457 review):
          whether there is anything to say under it, and whether it is about
          notifications or about installing, are facts of this browser that only
          the component knows (#455). The public VAPID key is a server fact
          handed down as a prop rather than a NEXT_PUBLIC_ twin (#431). */}
      <InstallHint vapidPublicKey={vapidPublicKey()} />

      {canLinkSelf && (
        <section className="app__more-block">
          <h2 className="app__month-head">
            <span>{APP_STRINGS.linkSelf.title}</span>
          </h2>
          <p className="app__comp-intro">{APP_STRINGS.linkSelf.intro}</p>
          {candidates.length === 0 ? (
            <div className="app__empty-state">{APP_STRINGS.linkSelf.empty}</div>
          ) : (
            <LinkSelfList candidates={candidates} />
          )}
        </section>
      )}

      <section className="app__more-block">
        <h2 className="app__month-head">
          <span>{APP_STRINGS.setPassword.title}</span>
        </h2>
        <p className="app__comp-intro">{APP_STRINGS.setPassword.intro}</p>
        <SetPasswordForm />
      </section>
    </AppShell>
  )
}
