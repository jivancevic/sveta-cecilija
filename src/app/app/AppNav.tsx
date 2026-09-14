'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { APP_STRINGS } from '@/lib/app/strings'
import { activeScreenKey, activeTabKey, type AppNav as Nav, type AppScreenKey } from '@/lib/app/screens'
import { ICON_STROKE, ScreenIcon } from './ui/ScreenIcon'
import { PrefetchTabs } from './PrefetchTabs'

// The two faces of one navigation (#472, #495, #562): the phone's floating
// pill bar and the laptop's grouped sidebar, both built from the same `AppNav`
// the server computed out of the permission set.
//
// The only thing these components need the browser for is knowing WHICH screen
// is lit, and that rule lives in `lib/app/screens.ts`, tested without a router.
// Everything else — which screens, in what order, in which group — was decided
// on the server, so a phone never ships the permission table.
//
// **The bar is a pill and it floats** (#562). It is fixed to the viewport, and
// the viewport never scrolls (`app.css`), so it cannot be rubber-banded away
// from the thumb. One dark pill slides between the tabs rather than five icons
// lighting up in turn: the movement is what tells you that you went left.
//
// The drawings themselves are `ui/ScreenIcon.tsx` since #569: Više lists the
// overflow as rows and wants the same picture the tab has, and one map is what
// makes those the same screen to a reader.

/** The bell, drawn from the same set so the header and the bar agree. */
export function BellIcon({ size = 22 }: { size?: number }) {
  return <Bell size={size} strokeWidth={ICON_STROKE} aria-hidden="true" />
}

function Icon({ k, on, size = 24 }: { k: AppScreenKey; on?: boolean; size?: number }) {
  return <ScreenIcon screen={k} on={on} size={size} />
}

/** Početna first, the three chosen screens, Više last (#563, #564). */
export function TabBar({ nav }: { nav: Nav }) {
  // `activeTabKey`, not `activeScreenKey`: a screen the bar does not carry is
  // one the reader reached through Više, so Više is the tab that lights. With
  // three tabs per account that is an everyday page, not an edge case.
  const active = activeTabKey(nav, usePathname() ?? '/app')
  if (nav.tabs.length === 0) return null

  const index = nav.tabs.findIndex((screen) => screen.key === active)

  return (
    <nav className="app__tabbar" aria-label={APP_STRINGS.header.navLabel}>
      {/* Renders nothing: it warms every tab in the bar on mount, so the next
          tap paints from the router cache instead of waiting on the server. */}
      <PrefetchTabs routes={nav.tabs.map((screen) => screen.route)} />
      <div
        className="app__tabbar-pill"
        style={{ ['--n' as string]: nav.tabs.length, ['--i' as string]: Math.max(index, 0) }}
      >
        {/* No pill at all on a page whose screen is not in the bar, rather than
            one parked under the first tab telling a lie. */}
        {index >= 0 && <span className="app__tabbar-thumb" aria-hidden="true" />}

        {nav.tabs.map((screen) => {
          const on = screen.key === active
          return (
            <Link
              key={screen.key}
              href={screen.route}
              // The full payload of a dynamic route, not just its frame (#593).
              prefetch={true}
              className={`app__tabbar-item${on ? ' app__tabbar-item--on' : ''}`}
              aria-current={on ? 'page' : undefined}
            >
              <Icon k={screen.key} on={on} />
              <span>{screen.short ?? screen.label}</span>
            </Link>
          )
        })}
      </div>
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

      {/* Početna sits above every workspace, the way it sits left of every tab
          (#564). Outside the groups because it belongs to no permission: it is
          the front door of an account rather than a screen of a job. */}
      <div className="app__sidebar-group">
        <Link
          href="/app"
          prefetch={true}
          className={`app__sidebar-item${active === 'home' ? ' app__sidebar-item--on' : ''}`}
          aria-current={active === 'home' ? 'page' : undefined}
        >
          <Icon k="home" on={active === 'home'} size={20} />
          {APP_STRINGS.screens.home}
        </Link>
      </div>

      {nav.groups.map((group) => (
        <div className="app__sidebar-group" key={group.group}>
          <p className="app__sidebar-head">{group.label}</p>
          {group.screens.map((screen) => {
            const on = screen.key === active
            return (
              <Link
                key={screen.key}
                href={screen.route}
                prefetch={true}
                className={`app__sidebar-item${on ? ' app__sidebar-item--on' : ''}`}
                aria-current={on ? 'page' : undefined}
              >
                <Icon k={screen.key} on={on} size={20} />
                {screen.label}
              </Link>
            )
          })}
        </div>
      ))}

      <div className="app__sidebar-group app__sidebar-group--last">
        <Link
          href="/app/more"
          prefetch={true}
          className={`app__sidebar-item${active === 'more' ? ' app__sidebar-item--on' : ''}`}
          aria-current={active === 'more' ? 'page' : undefined}
        >
          <Icon k="more" on={active === 'more'} size={20} />
          {APP_STRINGS.screens.more}
        </Link>
      </div>
    </nav>
  )
}
