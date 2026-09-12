'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { APP_TABS, APP_TAB_HREF, activeAppTab, type AppTab } from '@/lib/app/tabs'

// The bottom bar (#457): three real pages, not three states of one.
//
// Each tab is a `<Link>`, so the back button works, a tab is a URL a dancer can
// be sent, and the page under it is server-rendered like the rest of `/app`.
// The only thing this component needs the browser for is knowing WHICH tab is
// lit, and that rule lives in `lib/app/tabs.ts`, tested without a router.
//
// The icons are inline SVG rather than a font or a sprite: three paths cost
// nothing and a phone in the street should not wait on a second request to know
// where it is.

const ICONS: Record<AppTab, React.ReactNode> = {
  performances: (
    <>
      <rect x="3" y="5" width="18" height="16" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  mine: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
}

const LABELS: Record<AppTab, string> = {
  performances: APP_STRINGS.tabs.performances,
  mine: APP_STRINGS.tabs.mine,
  more: APP_STRINGS.tabs.more,
}

export function TabBar() {
  const active = activeAppTab(usePathname() ?? '/app')

  return (
    <nav className="app__tabbar" aria-label={APP_STRINGS.name}>
      {APP_TABS.map((tab) => {
        const on = tab === active
        return (
          <Link
            key={tab}
            href={APP_TAB_HREF[tab]}
            className={`app__tabbar-item${on ? ' app__tabbar-item--on' : ''}`}
            aria-current={on ? 'page' : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {ICONS[tab]}
            </svg>
            {LABELS[tab]}
          </Link>
        )
      })}
    </nav>
  )
}
