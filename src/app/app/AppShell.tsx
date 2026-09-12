import type { AppMember } from '@/lib/app/access'
import type { AppScreenKey } from '@/lib/app/screens'
import { screenByKey } from '@/lib/app/screens'
import { APP_STRINGS, ROLE_LABELS } from '@/lib/app/strings'
import type { AppViewer } from '@/lib/app/viewer'
import type { DanceRole } from '@/lib/moreskant-profile'
import { Sidebar, TabBar } from './AppNav'

// The chrome every screen wears (#495): the sidebar, the header, the content
// and the bar, in one place so no screen has to assemble them.
//
// A server component with one client island (the navigation), because WHICH
// screens a person has is a permission question the server has already answered
// and only "which one am I on" needs the browser. A screen page stays what it
// was: server-rendered data with no store.
//
// The header is the same everywhere (#473): the screen's title on the left, the
// notification bell on the right, phone and laptop alike. The bell arrives with
// the inbox (#496); until then the slot renders whatever a screen puts in
// `actions`, and nothing when it puts nothing.
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
  /** The right-hand side of the header. The bell lands here in #496. */
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
          {actions && <div className="app__header-actions">{actions}</div>}
        </header>

        {intro}
        {children}
      </div>

      <TabBar nav={viewer.nav} />
    </div>
  )
}

export type { AppMember }
