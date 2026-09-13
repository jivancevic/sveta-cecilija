// The permission → screen table of Cecilija (#495).
//
// ONE table, read by four things that used to disagree: the phone's bottom bar,
// the laptop's sidebar, the highlighter that says which tab you are on, and
// every page's own gate. It replaces `tabs.ts`, whose three hard-coded tabs
// could only describe a dancer.
//
// The contract comes from the route map (#473) and the bar rules (#472):
//
//   - A screen is unlocked by a SET of permissions, never by a role.
//   - `refunds` and `dev` unlock no screen: a refund is an action inside an
//     order, `dev` is the diagnostics strip and the Backoffice link.
//   - `moreskant` unlocks nothing unless the linked Member is a live dancer,
//     and `partner` nothing without a Partner link. Both are conditions on the
//     CONTEXT, so they are stripped from the set before the table is read.
//   - **Three tabs belong to the ACCOUNT, not to the rank** (#563). A `users`
//     holder picks them on Korisnici and they are stored on `Users.tabs`; an
//     account nobody has picked for reads the generic order below. Više is
//     always the last tab and never counts against the three, and neither will
//     Početna once T3 (#564) builds it.
//   - The laptop groups the same screens by workspace; a screen sits in the
//     first of its groups the person holds. The sidebar shows everything at
//     once, so a chosen set never hides a screen there.
//
// **Two columns, one table.** `unlockedBy` is the TARGET from the route map;
// `servesToday` is the subset the built screen actually serves. The shell ships
// before the screens do (#501 → #512), so the bar must offer only what exists:
// every screen ticket moves its permission from the first column into the
// second, and nothing else in this file changes. An empty `servesToday` is a
// screen that is not built yet.

import { permissionsOf, type Permission, type PermissionUser } from '@/lib/access/permissions'
import { APP_STRINGS } from './strings'

export type AppScreenKey =
  | 'orders'
  | 'performances'
  | 'members'
  | 'leaderboard'
  | 'scan'
  | 'sell'
  | 'statement'
  | 'inquiries'
  | 'comp'
  | 'users'
  | 'stats'
  | 'finance'
  | 'more'

/** The laptop sidebar's workspaces (#472), in the order they are listed. */
export type AppGroup = 'moreskant' | 'box' | 'partner' | 'door' | 'admin'

export interface AppScreen {
  key: AppScreenKey
  /** The Croatian label; the tab bar uses `short` when it has one. */
  label: string
  short?: string
  route: string
  /** Bar order (#472). Članovi came later and sits at 2.5 on purpose. */
  rank: number
  /** The route map's target: every permission that will unlock this screen. */
  unlockedBy: Permission[]
  /** What the BUILT screen serves today. Empty = not built yet. */
  servesToday: Permission[]
  /** Sidebar groups in preference order; the person's first held group wins. */
  groups: AppGroup[]
}

const S = APP_STRINGS.screens

export const APP_SCREENS: AppScreen[] = [
  {
    key: 'orders',
    label: S.orders,
    route: '/app/orders',
    rank: 1,
    unlockedBy: ['tickets'],
    servesToday: ['tickets'],
    groups: ['box'],
  },
  {
    key: 'performances',
    label: S.performances,
    route: '/app/performances',
    rank: 2,
    unlockedBy: ['tickets', 'moreska', 'moreskant'],
    // All three halves are live: the dancer's and the voditelj's (#457, #503)
    // and the blagajna's (#502). One screen, content by `can()`.
    servesToday: ['tickets', 'moreska', 'moreskant'],
    groups: ['moreskant', 'box'],
  },
  {
    key: 'members',
    label: S.members,
    route: '/app/members',
    rank: 2.5,
    unlockedBy: ['moreska'],
    servesToday: ['moreska'],
    groups: ['moreskant'],
  },
  {
    key: 'leaderboard',
    label: S.leaderboard,
    route: '/app/leaderboard',
    rank: 3,
    unlockedBy: ['moreskant', 'moreska'],
    servesToday: ['moreskant', 'moreska'],
    groups: ['moreskant'],
  },
  {
    key: 'scan',
    label: S.scan,
    route: '/app/scan',
    rank: 4,
    unlockedBy: ['door'],
    servesToday: ['door'],
    groups: ['door'],
  },
  {
    key: 'sell',
    label: S.sell,
    route: '/app/sell',
    rank: 5,
    unlockedBy: ['partner'],
    servesToday: ['partner'],
    groups: ['partner'],
  },
  {
    key: 'statement',
    label: S.statement,
    route: '/app/statement',
    rank: 6,
    unlockedBy: ['partner'],
    servesToday: ['partner'],
    groups: ['partner'],
  },
  {
    key: 'inquiries',
    label: S.inquiries,
    route: '/app/inquiries',
    rank: 7,
    unlockedBy: ['tickets'],
    servesToday: ['tickets'],
    groups: ['box'],
  },
  {
    key: 'comp',
    label: S.comp,
    short: S.compShort,
    route: '/app/comp',
    rank: 8,
    unlockedBy: ['tickets'],
    servesToday: ['tickets'],
    groups: ['box'],
  },
  {
    key: 'users',
    label: S.users,
    route: '/app/users',
    rank: 9,
    unlockedBy: ['users'],
    servesToday: ['users'],
    groups: ['admin'],
  },
  {
    key: 'stats',
    label: S.stats,
    route: '/app/stats',
    rank: 10,
    unlockedBy: ['tickets', 'season_stats', 'finance'],
    // All three read the season in counts (#508). `season_stats` unlocks this
    // and nothing else, which is the whole of the shared `member` login.
    servesToday: ['tickets', 'season_stats', 'finance'],
    groups: ['admin', 'box', 'moreskant'],
  },
  {
    key: 'finance',
    label: S.finance,
    route: '/app/finance',
    rank: 11,
    unlockedBy: ['finance'],
    // Money answers to `finance` and to nothing else (#500, #509).
    servesToday: ['finance'],
    groups: ['admin'],
  },
]

/**
 * Više: the last tab, always, and a screen every account that is in unlocks.
 * It is outside `APP_SCREENS` because it is not ranked and never overflows.
 */
export const MORE_SCREEN: AppScreen = {
  key: 'more',
  label: S.more,
  route: '/app/more',
  rank: Number.POSITIVE_INFINITY,
  unlockedBy: [],
  servesToday: [],
  groups: [],
}

/** Which permission opens a workspace at all (#472), in sidebar order. */
const GROUP_UNLOCK: Record<AppGroup, Permission[]> = {
  moreskant: ['moreska', 'moreskant'],
  box: ['tickets'],
  partner: ['partner'],
  door: ['door'],
  admin: ['users', 'season_stats', 'finance'],
}
const GROUP_ORDER: AppGroup[] = ['moreskant', 'box', 'partner', 'door', 'admin']

export const GROUP_LABEL: Record<AppGroup, string> = APP_STRINGS.groups

const BY_KEY = new Map<AppScreenKey, AppScreen>(
  [...APP_SCREENS, MORE_SCREEN].map((s) => [s.key, s]),
)

export function screenByKey(key: AppScreenKey): AppScreen {
  const screen = BY_KEY.get(key)
  if (!screen) throw new Error(`Unknown screen: ${key}`)
  return screen
}

/** How many screens an account carries in its bar (#563). Više is extra. */
export const MAX_TABS = 3

/**
 * A key that may be STORED on `Users.tabs`.
 *
 * Everything in the table except Više, which is always the last tab and is
 * therefore never chosen, and never Početna, which will be the first one for
 * the same reason once T3 (#564) builds it.
 */
export function isTabKey(value: unknown): value is AppScreenKey {
  return typeof value === 'string' && APP_SCREENS.some((s) => s.key === value)
}

/**
 * `Users.tabs` as the app reads it: an ordered list of at most three keys.
 *
 * Deliberately LENIENT, unlike the route that writes it. A stored key can stop
 * being a tab key between two deploys (a screen is renamed, a permission is
 * taken away), and the honest answer to a row the table no longer recognises is
 * a smaller bar, not a crash on the way into the app. The refusals live in
 * `users-tabs.ts`, where a person is looking at what they typed.
 */
export function tabKeysOf(value: unknown): AppScreenKey[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<AppScreenKey>()
  for (const entry of value) {
    if (isTabKey(entry)) seen.add(entry)
  }
  return [...seen].slice(0, MAX_TABS)
}

/**
 * The bar an account gets when nobody has chosen one for it (#563, Q57).
 *
 * One list per permission, in the words the decision used: what a person who
 * holds THIS and opens the app came to do. `moreskant` leads with the dance,
 * `tickets` with the money, `door` has exactly one screen and needs no rank to
 * find it.
 *
 * A permission that opens no screen of its own (`refunds`, `dev`, `editor`) is
 * absent rather than empty: it contributes nothing to a bar, and a set made
 * only of those unlocks nothing at all.
 */
// T4 (#565): swap to 'moreska' — the Moreška screen is being built in parallel
// and is not in the table yet, so "Moreška" reads as Izvedbe until it lands.
const MORESKA_SCREEN: AppScreenKey = 'performances'

const GENERIC_TABS: Partial<Record<Permission, AppScreenKey[]>> = {
  moreskant: [MORESKA_SCREEN, 'leaderboard'],
  moreska: [MORESKA_SCREEN, 'members', 'performances'],
  tickets: ['orders', 'performances', 'inquiries'],
  door: ['scan'],
  partner: ['sell', 'statement'],
  season_stats: ['stats'],
  finance: ['finance', 'stats'],
}

/**
 * Dancer first, then the box, then the rest: the merge order for a set that
 * holds several of them (#563). A voditelj who also works the till opens the
 * app on the dance, because that is the half only they can do.
 */
const GENERIC_MERGE: Permission[] = [
  'moreskant',
  'moreska',
  'tickets',
  'door',
  'partner',
  'season_stats',
  'finance',
]

/**
 * The three tabs of an account with no stored choice.
 *
 * The merged generic lists first, duplicates collapsed and anything not
 * unlocked dropped, then — when that is fewer than three — the rest of the
 * unlocked screens in rank order, so nobody is left with a one-tab bar while a
 * screen they hold sits in Više.
 */
export function genericTabs(unlocked: readonly AppScreen[], held: readonly Permission[]): AppScreenKey[] {
  const open = new Set(unlocked.map((s) => s.key))
  const chosen: AppScreenKey[] = []
  const take = (key: AppScreenKey) => {
    if (open.has(key) && !chosen.includes(key) && chosen.length < MAX_TABS) chosen.push(key)
  }

  for (const permission of GENERIC_MERGE) {
    if (!held.includes(permission)) continue
    for (const key of GENERIC_TABS[permission] ?? []) take(key)
  }
  for (const screen of unlocked) take(screen.key)

  return chosen
}

/**
 * The two conditional permissions, plus the test-only `target` switch.
 *
 * `target: true` reads the route map's whole table instead of what is built,
 * which is how the bar rules are tested before the screens they rank exist.
 */
export interface NavContext {
  /** The account's `Users.member` link resolves to a live dancer. */
  hasMember: boolean
  /** The account's `Users.partner` link resolves to a Partner. */
  hasPartner: boolean
  target?: boolean
}

/**
 * The permission set as the table reads it: the two conditional words drop out
 * when their link is missing, so nothing below this line has to remember them.
 */
function effectivePermissions(user: PermissionUser, ctx: NavContext): Permission[] {
  return permissionsOf(user).filter((p) => {
    if (p === 'moreskant') return ctx.hasMember
    if (p === 'partner') return ctx.hasPartner
    return true
  })
}

function unlocks(screen: AppScreen, held: Permission[], target: boolean): boolean {
  const column = target ? screen.unlockedBy : screen.servesToday
  return column.some((p) => held.includes(p))
}

/** Every screen this account may open, in rank order. Empty means "denied". */
export function unlockedScreens(user: PermissionUser, ctx: NavContext): AppScreen[] {
  const held = effectivePermissions(user, ctx)
  if (held.length === 0) return []
  return APP_SCREENS.filter((s) => unlocks(s, held, ctx.target === true))
}

export interface AppNav {
  /** The bottom bar, Više included and always last. Empty when denied. */
  tabs: AppScreen[]
  /** What Više lists above its standing rows. */
  overflow: AppScreen[]
  /** The landing route: the first tab, or null when nothing is unlocked. */
  landing: string | null
  /** The laptop sidebar, grouped by workspace; only groups with a screen. */
  groups: { group: AppGroup; label: string; screens: AppScreen[] }[]
}

/**
 * The whole navigation for one account: the bar, the overflow, the landing
 * screen and the sidebar, all from the one table.
 *
 * `chosen` is `Users.tabs` (#563) — what a `users` holder picked for this
 * account on Korisnici. A key the account does not unlock is dropped rather
 * than obeyed: the choice decides the ORDER of a bar, never who may open a
 * screen, and the permission set is still the only thing that answers that.
 * Empty or absent falls back to the generic order.
 */
export function appNav(
  user: PermissionUser,
  ctx: NavContext,
  chosen?: readonly AppScreenKey[] | null,
): AppNav {
  const unlocked = unlockedScreens(user, ctx)
  if (unlocked.length === 0) return { tabs: [], overflow: [], landing: null, groups: [] }

  const held = effectivePermissions(user, ctx)

  const picked = [...new Set(chosen ?? [])].filter((key) => unlocked.some((s) => s.key === key))
  const keys = (picked.length > 0 ? picked : genericTabs(unlocked, held)).slice(0, MAX_TABS)

  const tabs = keys.map(screenByKey)
  // Više lists every other screen the account unlocks, in rank order.
  const overflow = unlocked.filter((s) => !keys.includes(s.key))

  const heldGroups = GROUP_ORDER.filter((g) => GROUP_UNLOCK[g].some((p) => held.includes(p)))
  const groups = heldGroups
    .map((group) => ({
      group,
      label: GROUP_LABEL[group],
      screens: unlocked.filter(
        (s) => (s.groups.find((g) => heldGroups.includes(g)) ?? heldGroups[0]) === group,
      ),
    }))
    .filter((g) => g.screens.length > 0)

  return { tabs: [...tabs, MORE_SCREEN], overflow, landing: tabs[0]?.route ?? null, groups }
}

/** Rows that live under Više and light its tab rather than one of their own. */
const UNDER_MORE = ['/app/account', '/app/calendar', '/app/notifications']

/** The path without its query string and without a trailing slash. */
function normalize(pathname: string): string {
  const path = (pathname.split('?')[0] ?? '').replace(/\/+$/, '')
  return path || '/app'
}

function isUnder(path: string, route: string): boolean {
  // The trailing slash matters: without it `/app/performances-archive` would
  // light Izvedbe by accident.
  return path === route || path.startsWith(`${route}/`)
}

/**
 * The tab a pathname lights, or null for a page that carries no bar at all
 * (the landing redirect, login, the sign-in link, the consent screen, the
 * walkthrough and the install guide).
 */
export function activeScreenKey(pathname: string): AppScreenKey | null {
  const path = normalize(pathname)
  if (isUnder(path, MORE_SCREEN.route) || UNDER_MORE.some((r) => isUnder(path, r))) return 'more'
  return APP_SCREENS.find((s) => isUnder(path, s.route))?.key ?? null
}

/**
 * Which TAB a pathname lights (#563).
 *
 * `activeScreenKey` answers a different question — which SCREEN am I on — and
 * with three chosen tabs per account the answer is often a screen the bar does
 * not carry. Lighting nothing there tells the reader they are nowhere; they are
 * in fact somewhere they reached through Više, so **Više lights**. A path that
 * belongs to no screen at all (the login, the walkthrough) still lights
 * nothing, which is right: those pages have no bar to be in.
 *
 * Pure, and tested without a router: the browser only supplies the pathname.
 */
export function activeTabKey(nav: AppNav, pathname: string): AppScreenKey | null {
  const screen = activeScreenKey(pathname)
  if (screen === null) return null
  if (nav.tabs.some((tab) => tab.key === screen)) return screen
  return nav.overflow.some((s) => s.key === screen) ? MORE_SCREEN.key : null
}

/** The screen a route belongs to, so a page can gate on the table (#473). */
export function screenForPath(pathname: string): AppScreen | null {
  const path = normalize(pathname)
  if (isUnder(path, MORE_SCREEN.route)) return MORE_SCREEN
  return APP_SCREENS.find((s) => isUnder(path, s.route)) ?? null
}
