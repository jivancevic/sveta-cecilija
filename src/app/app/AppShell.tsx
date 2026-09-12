import { can } from '@/lib/access/permissions'
import type { AppMember } from '@/lib/app/access'
import type { AppScreenKey } from '@/lib/app/screens'
import { screenByKey } from '@/lib/app/screens'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import type { AppViewer } from '@/lib/app/viewer'
import type { DanceRole } from '@/lib/moreskant-profile'
import { Sidebar, TabBar } from './AppNav'
import { NotificationBell } from './NotificationBell'
import { ShowDayStrip } from './ShowDayStrip'

// The chrome every screen wears (#495): the sidebar, the header, the content
// and the bar, in one place so no screen has to assemble them.
//
// A server component with one client island (the navigation), because WHICH
// screens a person has is a permission question the server has already answered
// and only "which one am I on" needs the browser. A screen page stays what it
// was: server-rendered data with no store.
//
// The header is the same everywhere (#473): the screen's title on the left, the
// notification bell on the right, phone and laptop alike. The bell landed with
// the inbox (#496) and is now unconditional — it is the one control that is on
// every screen, and a slot that appeared and disappeared with a screen's own
// `actions` would move the bell under the reader's thumb. A screen's `actions`
// sit to its left in the same slot.
//
// "Odjava" is NOT in the header: it lives in Više, where the things a person
// does once a season live. A header button that ends the session sitting one
// thumb-width from the season label was a mis-tap waiting to happen.

/** "Cici · Crni kralj, Crni" — the small identity line of story 36. */
export function identityLine(member: {
  nickname?: string | null
  roles?: string[]
  primaryRole?: string | null
}): string {
  const ordered = [
    ...(member.primaryRole ? [member.primaryRole] : []),
    ...(member.roles ?? []).filter((r) => r !== member.primaryRole),
  ]
  const labels = ordered.map((r) => ROLE_LABELS[r as DanceRole] ?? r)
  return labels.length > 0 ? labels.join(', ') : APP_STRINGS.header.noRoles
}

export function AppShell({
  viewer,
  screen,
  title,
  season,
  actions,
  intro,
  children,
}: {
  /** Resolved once by the page; the navigation is read straight off it. */
  viewer: AppViewer
  /** The screen this page belongs to: names it and lights its tab. */
  screen?: AppScreenKey
  /** A title of the page's own, when the screen's label is not specific enough. */
  title?: string
  /** The season label under the title; omitted where it means nothing. */
  season?: number | null
  /** Extra controls left of the bell. The bell itself is always there (#496). */
  actions?: React.ReactNode
  /** A block between the header and the content (the performance detail's). */
  intro?: React.ReactNode
  children: React.ReactNode
}) {
  const heading = title ?? (screen ? screenByKey(screen).label : APP_STRINGS.name)

  return (
    <div className="app__frame">
      <Sidebar nav={viewer.nav} />

      <div className="app__shell">
        <header className="app__header">
          <div className="app__header-title">
            <h1>{heading}</h1>
            {season != null && (
              <p className="app__season">
                {APP_STRINGS.list.season} {season}
              </p>
            )}
          </div>
          <div className="app__header-actions">
            {actions}
            <NotificationBell unread={viewer.unreadNotifications} />
          </div>
        </header>

        {/* One line back to the scanner on the day of an izvedba (#472). Only
            for a `door` holder, and never on Skener itself, where the ring
            already says it with a number. */}
        {screen !== 'scan' && can({ permissions: viewer.permissions }, 'door') && <ShowDayStrip />}

        {intro}
        {children}
      </div>

      <TabBar nav={viewer.nav} />
    </div>
  )
}

export type { AppMember }
