import type { Metadata } from 'next'
import { getMyNotifications } from '@/lib/app/notifications-data'
import {
  getRosterMessageCounts,
  NO_ROSTER_MESSAGE_COUNTS,
} from '@/lib/app/roster-message-data'
import { APP_STRINGS } from '@/lib/app/strings'
import { calendarFeedUrl } from '@/lib/calendar/feed'
import { vapidPublicKey } from '@/lib/push/vapid'
import { isDancer } from '@/lib/app/viewer'
import { Section } from '../../ui'
import { AppShell } from '../../AppShell'
import { CalendarPanel } from '../../CalendarPanel'
import { NotificationsNudge } from '../../NotificationsNudge'
import { openScreen } from '../../gate'
import { InboxEmpty, NotificationList } from './NotificationList'
import { RosterMessage } from './RosterMessage'

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

  // "Napiši poruku" is the one action on this screen, and it is gated PER
  // ACTION rather than per screen (#654): Obavijesti is a Više row every
  // account the access decision admits can open, so the screen cannot be the
  // gate. A reader without `moreska` gets no component at all — hidden, not
  // greyed with "traži Moreška", which is Izvedbe's rule (#567) and exists so a
  // blagajna knows who to ask. Nobody has to ask a voditelj for permission to
  // write to the dancers. The counts are only read for the reader who can send.
  // `viewer.voditelj` IS `can(user, 'moreska')`, resolved once in `viewer.ts`;
  // re-typing the predicate here would be a second answer to the same question.
  const messageCounts = viewer.voditelj
    ? await getRosterMessageCounts()
    : NO_ROSTER_MESSAGE_COUNTS

  const calendarUrl = calendarFeedUrl(
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.CALENDAR_FEED_TOKEN,
  )

  return (
    <AppShell
      viewer={viewer}
      screen="more"
      title={APP_STRINGS.notifications.title}
      back={{ href: '/app/more', label: APP_STRINGS.screens.more }}
    >
      {viewer.voditelj && <RosterMessage counts={messageCounts} />}

      {/* The one place besides Početna, and only when the list is EMPTY (#682).
          An inbox with nothing in it has nothing else to say, and "you are not
          receiving these" is exactly why it might be empty. The widget REPLACES
          the empty card rather than standing under it: that card promises
          "javit ćemo ti", which is the one thing this device will not do. Over a
          full list there is no banner at all — a second permanent notice about
          one thing is nagging, and nagging is what people stop seeing. */}
      {rows.length === 0 ? (
        <NotificationsNudge
          isDancer={isDancer(viewer)}
          vapidPublicKey={vapidPublicKey()}
          fallback={<InboxEmpty />}
        />
      ) : (
        <NotificationList rows={rows} nowMs={nowMs} />
      )}

      {calendarUrl && (
        <section className="app__more-group">
          <Section title={APP_STRINGS.more.calendar} />
          <CalendarPanel url={calendarUrl} />
        </section>
      )}
    </AppShell>
  )
}
