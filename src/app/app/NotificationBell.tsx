'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { notificationBadge } from '@/lib/app/notification-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { BellIcon } from './AppNav'

// The bell in the header of every screen (#473, #496, #562).
//
// The count is a fact the server already read while resolving the viewer, and
// the one interaction is a navigation: no store, no polling, and the number is
// as fresh as the page, which is as fresh as it gets — every `/app` page is
// `force-dynamic`.
//
// A client component for ONE reason: the badge must not appear on the inbox
// itself (audit bug), and "which screen am I on" is the browser's question.
// The rule itself is `notificationBadge`, pure and tested without a router, so
// no page has to remember to blank its own bell.

export function NotificationBell({ unread }: { unread: number }) {
  const badge = notificationBadge(unread, usePathname() ?? '/app')

  return (
    <Link
      className="app__bell"
      href="/app/notifications"
      aria-label={APP_STRINGS.notifications.bell(unread)}
    >
      <span className="app__bell-icon">
        <BellIcon />
      </span>
      {badge && <span className="app__bell-badge">{badge}</span>}
    </Link>
  )
}
