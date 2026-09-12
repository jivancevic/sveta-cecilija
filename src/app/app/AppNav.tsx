'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { activeScreenKey, type AppNav as Nav, type AppScreenKey } from '@/lib/app/screens'

// The two faces of one navigation (#472, #495): the phone's bottom bar and the
// laptop's grouped sidebar, both built from the same `AppNav` the server
// computed out of the permission set.
//
// The only thing these components need the browser for is knowing WHICH screen
// is lit, and that rule lives in `lib/app/screens.ts`, tested without a router.
// Everything else — which screens, in what order, in which group — was decided
// on the server, so a phone never ships the permission table.
//
// The icons are inline SVG rather than a font or a sprite: a handful of paths
// cost nothing and a phone in the street should not wait on a second request to
// know where it is.

const ICONS: Record<AppScreenKey, React.ReactNode> = {
  performances: (
    <>
      <rect x="3" y="5" width="18" height="16" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  orders: (
    <>
      <path d="M4 7h16l-1.5 12h-13z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M15 20c0-2.5 1-4 3-4.5 1.7 0 3 1.7 3 4.5" />
    </>
  ),
  leaderboard: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  scan: (
    <>
      <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
      <path d="M7 12h10" />
    </>
  ),
  sell: (
    <>
      <rect x="3" y="7" width="18" height="11" />
      <path d="M3 11h18M8 7V5h8v2" />
    </>
  ),
  statement: <path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4" />,
  inquiries: <path d="M4 5h16v11H9l-5 4z" />,
  comp: (
    <>
      <path d="M4 9a2 2 0 0 0 0 6v3h16v-3a2 2 0 0 0 0-6V6H4z" />
      <path d="M12 6v12" />
    </>
  ),
  users: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  stats: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  finance: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M15 9.5C14.3 8.6 13.2 8 12 8c-1.7 0-3 1-3 2.2 0 2.8 6 1.2 6 3.9 0 1.2-1.3 2.2-3 2.2-1.2 0-2.3-.6-3-1.5" />
    </>
  ),
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
}

function Icon({ k }: { k: AppScreenKey }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONS[k]}
    </svg>
  )
}

/** The bottom bar: the person's first four screens, then Više. */
export function TabBar({ nav }: { nav: Nav }) {
  const active = activeScreenKey(usePathname() ?? '/app')
  if (nav.tabs.length === 0) return null

  return (
    <nav className="app__tabbar" aria-label={APP_STRINGS.header.navLabel}>
      {nav.tabs.map((screen) => {
        const on = screen.key === active
        return (
          <Link
            key={screen.key}
            href={screen.route}
            className={`app__tabbar-item${on ? ' app__tabbar-item--on' : ''}`}
            aria-current={on ? 'page' : undefined}
          >
            <Icon k={screen.key} />
            {screen.short ?? screen.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** The laptop sidebar: every screen at once, grouped by workspace. */
export function Sidebar({ nav }: { nav: Nav }) {
  const active = activeScreenKey(usePathname() ?? '/app')
  if (nav.tabs.length === 0) return null

  return (
    <nav className="app__sidebar" aria-label={APP_STRINGS.header.navLabel}>
      <p className="app__sidebar-brand">{APP_STRINGS.name}</p>

      {nav.groups.map((group) => (
        <div className="app__sidebar-group" key={group.group}>
          <p className="app__sidebar-head">{group.label}</p>
          {group.screens.map((screen) => {
            const on = screen.key === active
            return (
              <Link
                key={screen.key}
                href={screen.route}
                className={`app__sidebar-item${on ? ' app__sidebar-item--on' : ''}`}
                aria-current={on ? 'page' : undefined}
              >
                <Icon k={screen.key} />
                {screen.label}
              </Link>
            )
          })}
        </div>
      ))}

      <div className="app__sidebar-group app__sidebar-group--last">
        <Link
          href="/app/more"
          className={`app__sidebar-item${active === 'more' ? ' app__sidebar-item--on' : ''}`}
          aria-current={active === 'more' ? 'page' : undefined}
        >
          <Icon k="more" />
          {APP_STRINGS.screens.more}
        </Link>
      </div>
    </nav>
  )
}
