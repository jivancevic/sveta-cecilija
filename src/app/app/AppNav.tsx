'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  ChartColumn,
  Ellipsis,
  FileText,
  Gift,
  Inbox,
  Receipt,
  ScanLine,
  Store,
  Trophy,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react'
import { APP_STRINGS } from '@/lib/app/strings'
import { activeScreenKey, activeTabKey, type AppNav as Nav, type AppScreenKey } from '@/lib/app/screens'

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
// Icons are Lucide at stroke 1.75 (1.9 on the tab you are on), with ONE
// exception drawn by hand: the crossed swords of Izvedbe. The moreška is a
// sword dance, no icon set ships the right pair of blades, and an emoji in a
// navigation bar is not a decision this app makes.

const STROKE = 1.75
const STROKE_ON = 1.9

/** The blades: the one drawing in Cecilija that is Cecilija's own. */
function Swords({ strokeWidth }: { strokeWidth: number }) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
      <path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
      <path d="M5 14l4 4" />
      <path d="M7 17l-4 4" />
    </svg>
  )
}

type IconFor = (props: { size: number; strokeWidth: number }) => React.ReactNode

const ICONS: Record<AppScreenKey, IconFor> = {
  performances: (p) => <Swords strokeWidth={p.strokeWidth} />,
  orders: (p) => <Receipt {...p} aria-hidden="true" />,
  members: (p) => <Users {...p} aria-hidden="true" />,
  leaderboard: (p) => <Trophy {...p} aria-hidden="true" />,
  scan: (p) => <ScanLine {...p} aria-hidden="true" />,
  sell: (p) => <Store {...p} aria-hidden="true" />,
  statement: (p) => <FileText {...p} aria-hidden="true" />,
  inquiries: (p) => <Inbox {...p} aria-hidden="true" />,
  comp: (p) => <Gift {...p} aria-hidden="true" />,
  users: (p) => <UserCog {...p} aria-hidden="true" />,
  stats: (p) => <ChartColumn {...p} aria-hidden="true" />,
  finance: (p) => <Wallet {...p} aria-hidden="true" />,
  more: (p) => <Ellipsis {...p} aria-hidden="true" />,
}

/** The bell, drawn from the same set so the header and the bar agree. */
export function BellIcon({ size = 22 }: { size?: number }) {
  return <Bell size={size} strokeWidth={STROKE} aria-hidden="true" />
}

function Icon({ k, on, size = 24 }: { k: AppScreenKey; on?: boolean; size?: number }) {
  return <>{ICONS[k]({ size, strokeWidth: on ? STROKE_ON : STROKE })}</>
}

/** The bottom bar: the three screens this account carries, then Više (#563). */
export function TabBar({ nav }: { nav: Nav }) {
  // `activeTabKey`, not `activeScreenKey`: a screen the bar does not carry is
  // one the reader reached through Više, so Više is the tab that lights. With
  // three tabs per account that is an everyday page, not an edge case.
  const active = activeTabKey(nav, usePathname() ?? '/app')
  if (nav.tabs.length === 0) return null

  const index = nav.tabs.findIndex((screen) => screen.key === active)

  return (
    <nav className="app__tabbar" aria-label={APP_STRINGS.header.navLabel}>
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
