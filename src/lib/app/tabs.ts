// Which of the three tabs a path belongs to (#457).
//
// The bar has three buttons and the app has more than three pages, so every
// page below a tab has to light that tab up: a dancer who opened an evening
// from the list is still "in" Izvedbe, and the scoreboard reached from Više is
// still "in" Više. Pure, so the rule is stated once and tested without a router.

export const APP_TABS = ['performances', 'mine', 'more'] as const
export type AppTab = (typeof APP_TABS)[number]

export const APP_TAB_HREF: Record<AppTab, string> = {
  performances: '/app',
  mine: '/app/moje',
  more: '/app/vise',
}

/**
 * The tab a pathname lives under, or null for a page that carries no bar at all
 * (login, the sign-in link, the consent screen).
 */
export function activeAppTab(pathname: string): AppTab | null {
  const path = pathname.replace(/\/+$/, '') || '/app'
  // The trailing slash matters: without it a future `/app/izvedbe-arhiva`
  // would light Izvedbe by accident, which is the class of bug the other three
  // lines already avoid.
  if (path === '/app' || path.startsWith('/app/izvedba/')) return 'performances'
  if (path === '/app/moje' || path.startsWith('/app/moje/')) return 'mine'
  if (path === '/app/vise' || path.startsWith('/app/vise/')) return 'more'
  if (path === '/app/statistika' || path.startsWith('/app/statistika/')) return 'more'
  // Both are rows in Više and nothing else links to them (#463): the password
  // a dancer may set, and the voditelj's invitations screen.
  if (path === '/app/set-password') return 'more'
  if (path === '/app/pozivnice') return 'more'
  return null
}
