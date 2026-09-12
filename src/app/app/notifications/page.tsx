import type { Metadata } from 'next'
import Link from 'next/link'
import { getMyNotifications } from '@/lib/app/notifications-data'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { NotificationList } from './NotificationList'

// `/app/notifications` — the Sandučić obavijesti (#473, #496).
//
// `openScreen()` with NO screen key, like `/app/account` and `/app/invitations`:
// this is a Više row rather than a tab, so it has no entry in the permission →
// screen table and the gate only asks the first two questions (is there a
// session, is this account in Cecilija at all). `UNDER_MORE` in `screens.ts`
// already lists the route, so Više stays lit while it is open.
//
// Every account that is in has an inbox, whatever it holds: the bell is on
// every screen, so a screen behind it that some accounts could not open would
// be a control that sometimes refuses itself.

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

  return (
    <AppShell viewer={viewer} screen="more" title={APP_STRINGS.notifications.title}>
      <Link className="app__back" href="/app/more">
        ‹ {APP_STRINGS.screens.more}
      </Link>

      <NotificationList rows={rows} nowMs={nowMs} />
    </AppShell>
  )
}
