import Image from 'next/image'
import type { AppMember } from '@/lib/app/access'
import type { AppScreenKey } from '@/lib/app/screens'
import { screenByKey } from '@/lib/app/screens'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import type { AppViewer } from '@/lib/app/viewer'
import type { DanceRole } from '@/lib/moreskant-profile'
import { Sidebar, TabBar } from './AppNav'
import { NotificationBell } from './NotificationBell'
import { PullToRefresh } from './PullToRefresh'

// The chrome every screen wears (#495): the sidebar, the header, the content
// and the bar, in one place so no screen has to assemble them.
//
// A server component with one client island (the navigation), because WHICH
// screens a person has is a permission question the server has already answered
// and only "which one am I on" needs the browser. A screen page stays what it
// was: server-rendered data with no store.
//
// The header is the same everywhere (#473): the screen's title on the left, the
// notification bell on the right, phone and laptop alike. **Početna is the one
// exception and the only screen with the logo** (#564): its left-hand side is
// the mark and the wordmark, because a landing screen titled "Početna" would
// name the tab the reader just pressed instead of naming the app they are in.
// One screen carries the brand and eleven carry their own name.
//
// The bell landed with
// the inbox (#496) and is now unconditional — it is the one control that is on
// every screen, and a slot that appeared and disappeared with a screen's own
// `actions` would move the bell under the reader's thumb. A screen's `actions`
// sit to its left in the same slot.
//
// "Odjava" is NOT in the header: it lives in Više, where the things a person
// does once a season live. A header button that ends the session sitting one
// thumb-width from the season label was a mis-tap waiting to happen.
//
// **This component is rendered by every page, not by the route group's layout,
// so it REMOUNTS on every client navigation.** Nothing that has to survive a
// navigation can keep its state here: a ref set before a `popstate` belongs to
// an instance that is already gone by the time the next screen mounts. That is
// why `ScrollMemory` lives in `layout.tsx` (#562 review), and why the tab bar's
// thumb does not slide between screens — it is re-rendered in its new place
// rather than animated into it, which T1 accepts.

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
  brand = false,
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
  /**
   * Wear the logo and the wordmark instead of a title. Početna, and nowhere
   * else (#564): Cecilija is named once.
   */
  brand?: boolean
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

      {/* Everything that scrolls is inside the gesture (#562); the sidebar and
          the bar are outside it, because neither of them moves. */}
      <PullToRefresh>
        <div className="app__shell">
          <header className={`app__header${brand ? ' app__header--brand' : ''}`}>
            {brand ? (
              <div className="app__header-brand">
                {/* Decorative: the wordmark beside it is the accessible name. */}
                <Image
                  className="app__logo"
                  src="/cecilija-logo.webp"
                  alt=""
                  width={32}
                  height={40}
                  priority
                />
                <h1 className="app__wordmark">{APP_STRINGS.landing.brand}</h1>
              </div>
            ) : (
              <div className="app__header-title">
                <h1>{heading}</h1>
                {season != null && (
                  <p className="app__season">
                    {APP_STRINGS.list.season} {season}
                  </p>
                )}
              </div>
            )}
            <div className="app__header-actions">
              {actions}
              <NotificationBell unread={viewer.unreadNotifications} />
            </div>
          </header>

          {intro}
          {children}
        </div>
      </PullToRefresh>

      <TabBar nav={viewer.nav} />
    </div>
  )
}

export type { AppMember }
