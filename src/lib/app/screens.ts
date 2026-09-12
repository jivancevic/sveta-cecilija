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
//   - The first four screens a person unlocks are tabs, in rank order, and
//     Izvedbe jumps to the front for a `moreskant` holder. Više is always the
//     last tab and never counts against the four.
//   - The laptop groups the same screens by workspace; a screen sits in the
//     first of its groups the person holds.
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
    servesToday: [],
    groups: ['box'],
  },
  {
    key: 'performances',
    label: S.performances,
    route: '/app/performances',
    rank: 2,
    unlockedBy: ['tickets', 'moreska', 'moreskant'],
    // The dancer's and the voditelj's half is live (#457); the blagajna's half
    // is #502.
    servesToday: ['moreska', 'moreskant'],
    groups: ['moreskant', 'box'],
  },
  {
    key: 'members',
    label: S.members,
    route: '/app/members',
    rank: 2.5,
    unlockedBy: ['moreska'],
    servesToday: [],
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
    servesToday: [],
    groups: ['door'],
  },
  {
    key: 'sell',
    label: S.sell,
    route: '/app/sell',
    rank: 5,
    unlockedBy: ['partner'],
    servesToday: [],
    groups: ['partner'],
  },
  {
    key: 'statement',
    label: S.statement,
    route: '/app/statement',
    rank: 6,
    unlockedBy: ['partner'],
    servesToday: [],
    groups: ['partner'],
  },
  {
    key: 'inquiries',
    label: S.inquiries,
    route: '/app/inquiries',
    rank: 7,
    unlockedBy: ['tickets'],
    servesToday: [],
    groups: ['box'],
  },
  {
    key: 'comp',
    label: S.comp,
    short: S.compShort,
    route: '/app/comp',
    rank: 8,
    unlockedBy: ['tickets'],
    servesToday: [],
    groups: ['box'],
  },
  {
    key: 'users',
    label: S.users,
    route: '/app/users',
    rank: 9,
    unlockedBy: ['users'],
    servesToday: [],
    groups: ['admin'],
  },
  {
    key: 'stats',
    label: S.stats,
    route: '/app/stats',
    rank: 10,
    unlockedBy: ['tickets', 'season_stats', 'finance'],
    servesToday: [],
    groups: ['admin', 'box', 'moreskant'],
  },
  {
    key: 'finance',
    label: S.finance,
    route: '/app/finance',
    rank: 11,
    unlockedBy: ['finance'],
    servesToday: [],
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

const MAX_TABS = 4

/**
 * The whole navigation for one account: the bar, the overflow, the landing
 * screen and the sidebar, all from the one table.
 */
export function appNav(user: PermissionUser, ctx: NavContext): AppNav {
  const unlocked = unlockedScreens(user, ctx)
  if (unlocked.length === 0) return { tabs: [], overflow: [], landing: null, groups: [] }

  // A dancer opens this app to see where they dance next, whatever else they
  // hold (#472). Only Izvedbe jumps; every other screen keeps its rank.
  const dancer = effectivePermissions(user, ctx).includes('moreskant')
  const ordered = dancer
    ? [
        ...unlocked.filter((s) => s.key === 'performances'),
        ...unlocked.filter((s) => s.key !== 'performances'),
      ]
    : unlocked

  const tabs = ordered.slice(0, MAX_TABS)
  const overflow = ordered.slice(MAX_TABS)

  const held = effectivePermissions(user, ctx)
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
const UNDER_MORE = ['/app/account', '/app/invitations', '/app/calendar', '/app/notifications']

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

/** The screen a route belongs to, so a page can gate on the table (#473). */
export function screenForPath(pathname: string): AppScreen | null {
  const path = normalize(pathname)
  if (isUnder(path, MORE_SCREEN.route)) return MORE_SCREEN
  return APP_SCREENS.find((s) => isUnder(path, s.route)) ?? null
}
