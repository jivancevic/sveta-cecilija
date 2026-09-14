import type { Metadata } from 'next'
import Link from 'next/link'
import { getMyNotifications } from '@/lib/app/notifications-data'
import { APP_STRINGS } from '@/lib/app/strings'
import { calendarFeedUrl } from '@/lib/calendar/feed'
import { Section } from '../ui'
import { AppShell } from '../AppShell'
import { CalendarPanel } from '../CalendarPanel'
import { openScreen } from '../gate'
import { NotificationList } from './NotificationList'

// `/app/notifications` — the Sandučić obavijesti (#473, #496, reskinned #569).
//
// `openScreen()` with NO screen key, like `/app/account`:
// this is a Više row rather than a tab, so it has no entry in the permission →
// screen table and the gate only asks the first two questions (is there a
// session, is this account in Cecilija at all). `UNDER_MORE` in `screens.ts`
// already lists the route, so Više stays lit while it is open.
//
// Every account that is in has an inbox, whatever it holds: the bell is on
// every screen, so a screen behind it that some accounts could not open would
// be a control that sometimes refuses itself.
//
// **The calendar sits UNDER the list** (#569, Q48). It used to be a panel in
// Više. Both halves of this screen are the same promise told at two speeds —
// "we will tell you" and "your phone will already know" — and the loud one goes
// first: a person opens this screen because something happened, not because
// they came to subscribe to a feed. A deployment missing either half of the
// feed URL simply shows no panel, rather than a heading over a broken link.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.notifications.title} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default async function NotificationsPage() {
  const { viewer, refusal } = await openScreen()
  if (refusal) return refusal

  // The loader hands down the server's clock with the rows: the labels are
  // "danas"/"jučer", and reading a clock during a render (here or in the
  // browser) is both impure and a chance for the two to disagree.
  const { rows, nowMs } = await getMyNotifications(viewer.userId)

  const calendarUrl = calendarFeedUrl(
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.CALENDAR_FEED_TOKEN,
  )

  return (
    <AppShell viewer={viewer} screen="more" title={APP_STRINGS.notifications.title}>
      <Link className="app__back" href="/app/more">
        ‹ {APP_STRINGS.screens.more}
      </Link>

      <NotificationList rows={rows} nowMs={nowMs} />

      {calendarUrl && (
        <section className="app__more-group">
          <Section title={APP_STRINGS.more.calendar} />
          <CalendarPanel url={calendarUrl} />
        </section>
      )}
    </AppShell>
  )
}
