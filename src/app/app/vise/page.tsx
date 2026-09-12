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

      <section className="app__more-block">
        <h2 className="app__month-head">
          <span>{APP_STRINGS.more.notifications}</span>
        </h2>
        {/* The public VAPID key is a server fact handed to the client as a prop
            rather than a NEXT_PUBLIC_ twin of the same value (#431). */}
        <InstallHint vapidPublicKey={vapidPublicKey()} />
      </section>

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
