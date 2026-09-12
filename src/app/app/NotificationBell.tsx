import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'

// The bell in the header of every screen (#473, #496).
//
// A server component and a plain `Link`: the count is a fact the server already
// read while resolving the viewer, and the one interaction is a navigation. No
// store, no polling, no client bundle — the number is as fresh as the page, and
// every `/app` page is `force-dynamic`.
//
// The badge is the count, not a dot: "three things happened" is the reason to
// open it, and a dot would make every screen look the same whether one thing or
// twenty had happened. Above 99 the exact number stops being information.

export function NotificationBell({ unread }: { unread: number }) {
  const badge =
    unread > 99 ? APP_STRINGS.notifications.badgeOverflow : unread > 0 ? String(unread) : null

  return (
    <Link
      className="app__bell"
      href="/app/notifications"
      aria-label={APP_STRINGS.notifications.bell(unread)}
    >
      {/* Inline, not an icon font or an image: one glyph, two colours, and it
          has to inherit the header's `currentColor` in both themes. */}
      <svg
        className="app__bell-icon"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
        <path d="M10.3 19a2 2 0 0 0 3.4 0" />
      </svg>
      {badge && <span className="app__bell-badge">{badge}</span>}
    </Link>
  )
}
