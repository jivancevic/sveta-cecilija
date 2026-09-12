import Link from 'next/link'
import { redirect } from 'next/navigation'
import { accessMember } from '@/lib/app/access'
import { APP_STRINGS } from '@/lib/app/strings'
import { resolveAppViewer } from '@/lib/app/viewer'
import { vapidPublicKey } from '@/lib/push/vapid'
import { calendarFeedUrl } from '@/lib/calendar/feed'
import { AppShell, identityLine } from '../AppShell'
import { CalendarPanel } from '../CalendarPanel'
import { DeniedPage } from '../DeniedPage'
import { InstallHint } from '../InstallHint'
import { LogoutButton } from '../LogoutButton'

// `/app/vise` — the Više tab (#457).
//
// Everything a dancer touches once a season: the scoreboard, the notification
// switch, the calendar subscription, their own record, and the way out. They
// were scattered down the bottom of the home screen before, under the list a
// dancer reads every day; a tab of their own is what stops them competing with
// tonight's evening for the same thumb.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function MorePage() {
  const viewer = await resolveAppViewer()
  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') return <DeniedPage />

  const me = accessMember(viewer.access)
  const voditelj = viewer.access.kind === 'voditelj'

  // Both halves are server facts handed down as one prop: a deployment missing
  // either simply shows no panel, rather than a heading over a broken link.
  const calendarUrl = calendarFeedUrl(
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.CALENDAR_FEED_TOKEN,
  )

  return (
    <AppShell me={me}>
      <nav className="app__more">
        <Link className="app__more-row" href="/app/statistika">
          {APP_STRINGS.more.stats}
          <span aria-hidden="true">›</span>
        </Link>
        {/* The walkthrough, replayable: the page sets the cookie only when it
            is finished or skipped, so opening it again changes nothing. */}
        <Link className="app__more-row" href="/app/dobrodosli">
          {APP_STRINGS.more.onboarding}
          <span aria-hidden="true">›</span>
        </Link>
        {/* The same guide the Dobrodošlica's first step shows, full screen
            (#455). It lives here too because a dancer who skipped the
            walkthrough, or who is holding somebody else's phone at a rehearsal,
            needs a way back to it that is not three steps long. */}
        <Link className="app__more-row" href="/app/instalacija">
          {APP_STRINGS.install.guideTitle}
          <span aria-hidden="true">›</span>
        </Link>
        {/* The durable way to "Poveži svoj račun s članom" (#462). The hero on
            `/app` carries the same link, but only while there is a next evening
            to hang it under: out of season a voditelj who has just been given
            an account would otherwise have nowhere to go.

            On the RAW link, like the hero and like the screen itself (#462
            review): an account whose link points at a retired Member has no
            `me` either, and the route would refuse every choice it made. */}
        {voditelj && viewer.memberLinkId === null && (
          <Link className="app__more-row" href="/app/povezi">
            {APP_STRINGS.linkSelf.action}
            <span aria-hidden="true">›</span>
          </Link>
        )}
        {/* "Postavi lozinku" (#463). Optional by design: an invitation signs a
            dancer in and a session lasts thirty days, so most of the roster
            will never open this. It sits here rather than on a screen they are
            sent to, which is the whole point of moving it. */}
        <Link className="app__more-row" href="/app/set-password">
          {APP_STRINGS.setPassword.title}
          <span aria-hidden="true">›</span>
        </Link>
        {voditelj && (
          <>
            {/* The admin is a different app under the same origin, so these are
                plain navigations rather than client transitions; Link is what
                the Next lint rule wants for an in-app URL either way. */}
            <Link className="app__more-row" href="/admin" prefetch={false}>
              {APP_STRINGS.more.admin}
              <span aria-hidden="true">›</span>
            </Link>
            <Link className="app__more-row" href="/admin/collections/members" prefetch={false}>
              {APP_STRINGS.more.members}
              <span aria-hidden="true">›</span>
            </Link>
          </>
        )}
      </nav>

      {/* The heading belongs to the component, not to the page (#457 review):
          whether there is anything to say under it, and whether it is about
          notifications or about installing, are facts of this browser that only
          the component knows (#455). The public VAPID key is a server fact
          handed down as a prop rather than a NEXT_PUBLIC_ twin of the same
          value (#431). */}
      <InstallHint vapidPublicKey={vapidPublicKey()} />

      {calendarUrl && (
        <section className="app__more-block">
          <h2 className="app__month-head">
            <span>{APP_STRINGS.more.calendar}</span>
          </h2>
          <CalendarPanel url={calendarUrl} />
        </section>
      )}

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

      <div className="app__more-logout">
        <LogoutButton className="app__button app__button--quiet" />
      </div>
    </AppShell>
  )
}
