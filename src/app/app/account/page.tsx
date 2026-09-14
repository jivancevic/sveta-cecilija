import type { Metadata } from 'next'
import Link from 'next/link'
import { getSelfLinkCandidates } from '@/lib/app/link-self-data'
import { APP_STRINGS } from '@/lib/app/strings'
import { vapidPublicKey } from '@/lib/push/vapid'
import { Card, List, ListRow, Section } from '../ui'
import { AppShell, identityLine } from '../AppShell'
import { openScreen } from '../gate'
import { LinkSelfList } from './LinkSelfList'
import { PushSwitch } from './PushSwitch'
import { SetPasswordForm } from './SetPasswordForm'
import { ThemeSwitch } from './ThemeSwitch'

// `/app/account` — Profil (#473, reskinned and renamed by #569).
//
// Everything about the person and about the phone in their hand, on one screen:
// their own record, the two switches, an optional password, and — for a
// voditelj who dances but whose login carries no Member — the one sanctioned way
// to link it (#462).
//
// **Four sections, and each one is a setting rather than a banner.** What used
// to be here was `InstallHint`: one component that decided, from the platform,
// whether to ask about installing or about notifications, and answered either
// with a button whose label flipped. #569 pulled the notification half out as a
// switch (`PushSwitch`) and left the install half to `/app/install`, which is a
// whole screen about it and is one row away in Više. A banner that asks a
// question is right the first time and noise the fifth.
//
// **Izgled is per device, not per account** (`lib/app/theme.ts`): which skin to
// wear is a fact of the phone, and a shared login has no single answer at all.
//
// **Sigurnost carries the anchor Više links to.** `#security` rather than a
// route of its own: the password form is a section of this screen, and a second
// URL for it would exist only so that a row could point somewhere.
//
// The password is OPTIONAL by design (#463): an invitation signs a dancer in and
// a session lasts thirty days, so most of the roster will never set one.
//
// Linking is offered only to a voditelj whose RAW link is empty, the same
// condition the route re-applies (#462 review): a moreškant already has a link
// by construction, and an account whose link points at a retired Member would be
// offered a list whose every tap 409s.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.screens.account} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

const S = APP_STRINGS.more

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
        <section className="app__more-group">
          <Section title={S.profile} />
          <List>
            <ListRow title={S.nickname} trail={<span className="ui-small">{me.nickname || S.missing}</span>} />
            <ListRow title={S.roles} trail={<span className="ui-small">{identityLine(me)}</span>} />
            <ListRow title={S.mobile} trail={<span className="ui-small">{me.mobile || S.missing}</span>} />
          </List>
        </section>
      )}

      <section className="app__more-group">
        <Section title={APP_STRINGS.theme.title} />
        <Card>
          <ThemeSwitch />
        </Card>
      </section>

      <section className="app__more-group">
        <Section title={APP_STRINGS.notifications.title} />
        <Card>
          {/* The public VAPID key is a server fact handed down as a prop rather
              than a NEXT_PUBLIC_ twin (#431). A deployment without one has no
              push at all, and the switch says so instead of failing on a tap. */}
          <PushSwitch vapidPublicKey={vapidPublicKey()} />
        </Card>
      </section>

      {canLinkSelf && (
        <section className="app__more-group">
          <Section title={APP_STRINGS.linkSelf.title} />
          {candidates.length === 0 ? (
            <Card>
              <p className="app__setting-note">{APP_STRINGS.linkSelf.empty}</p>
            </Card>
          ) : (
            <>
              <p className="app__setting-note">{APP_STRINGS.linkSelf.intro}</p>
              <LinkSelfList candidates={candidates} />
            </>
          )}
        </section>
      )}

      {/* The anchor Više's Sigurnost row lands on. */}
      <section className="app__more-group" id="security">
        <Section title={S.security} />
        <Card>
          <p className="app__setting-note">{APP_STRINGS.setPassword.intro}</p>
          <SetPasswordForm />
        </Card>
      </section>
    </AppShell>
  )
}
