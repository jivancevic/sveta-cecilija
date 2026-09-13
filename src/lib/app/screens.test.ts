import { describe, expect, it } from 'vitest'
import type { Permission } from '@/lib/access/permissions'
import {
  APP_SCREENS,
  MAX_TABS,
  MORE_SCREEN,
  activeScreenKey,
  activeTabKey,
  appNav,
  genericTabs,
  isTabKey,
  screenByKey,
  screenForPath,
  tabKeysOf,
  unlockedScreens,
  type AppScreenKey,
} from './screens'

// The permission → screen table (#495, from the route map decided in #473 and
// the bar rules in #472). Everything the bar, the sidebar and every page gate
// does is a pure function of this table, so it is table-tested per bundle.

const user = (...permissions: Permission[]) => ({ permissions })

/** The context the two conditional permissions need (#473's access rule). */
const ctx = (over: { hasMember?: boolean; hasPartner?: boolean } = {}) => ({
  hasMember: over.hasMember ?? false,
  hasPartner: over.hasPartner ?? false,
})

const keys = (screens: { key: AppScreenKey }[]) => screens.map((s) => s.key)

describe('the screen table', () => {
  it('is in rank order and has no duplicate key, route or rank', () => {
    const ranks = APP_SCREENS.map((s) => s.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(ranks).size).toBe(ranks.length)
    expect(new Set(APP_SCREENS.map((s) => s.key)).size).toBe(APP_SCREENS.length)
    expect(new Set(APP_SCREENS.map((s) => s.route)).size).toBe(APP_SCREENS.length)
  })

  it('carries every route map screen, each on an English segment under /app', () => {
    expect(keys(APP_SCREENS)).toEqual([
      'orders',
      'performances',
      'members',
      'leaderboard',
      'scan',
      'sell',
      'statement',
      'inquiries',
      'comp',
      'users',
      'stats',
      'finance',
    ])
    for (const screen of [...APP_SCREENS, MORE_SCREEN]) {
      expect(screen.route).toMatch(/^\/app\/[a-z]+$/)
    }
  })

  it('serves today only what is actually built, never more than the target', () => {
    // A screen ticket grows `servesToday` toward `unlockedBy`; until it does,
    // the bar must not offer a tab that 404s.
    for (const screen of APP_SCREENS) {
      for (const permission of screen.servesToday) {
        expect(screen.unlockedBy).toContain(permission)
      }
    }
    const live = APP_SCREENS.filter((s) => s.servesToday.length > 0)
    expect(keys(live)).toEqual([
      'orders',
      'performances',
      'members',
      'leaderboard',
      'scan',
      'sell',
      'statement',
      'inquiries',
      'comp',
      'users',
      'stats',
      'finance',
    ])
  })

  it('keeps Financije to a finance holder, and tickets alone does not open it', () => {
    // The page gate IS this table (`openScreen('finance')` asks it), so the
    // refusal of the money screen is asserted here rather than in a rendered
    // page. `tickets` is the set that matters: the secretary sees every order
    // and every seat, and since #500 that is not the same as seeing the money.
    expect(keys(unlockedScreens(user('finance'), ctx()))).toContain('finance')
    const others: [ReturnType<typeof user>, ReturnType<typeof ctx>][] = [
      [user('tickets', 'refunds'), ctx()],
      [user('door'), ctx()],
      [user('partner'), ctx({ hasPartner: true })],
      [user('moreskant'), ctx({ hasMember: true })],
      [user('moreska'), ctx()],
      [user('season_stats'), ctx()],
      [user('users', 'dev'), ctx()],
    ]
    for (const [who, where] of others) {
      expect(keys(unlockedScreens(who, where))).not.toContain('finance')
    }
  })

  it('gives refunds and dev no screen of their own', () => {
    for (const screen of APP_SCREENS) {
      expect(screen.unlockedBy).not.toContain('refunds')
      expect(screen.unlockedBy).not.toContain('dev')
    }
  })
})

describe('unlockedScreens', () => {
  it('gives a dancer with a live Member row Izvedbe and Ljestvica', () => {
    expect(keys(unlockedScreens(user('moreskant'), ctx({ hasMember: true })))).toEqual([
      'performances',
      'leaderboard',
    ])
  })

  it('gives a moreskant holder without an active Member nothing', () => {
    expect(unlockedScreens(user('moreskant'), ctx({ hasMember: false }))).toEqual([])
  })

  it('gives a partner holder without a Partner link nothing', () => {
    expect(unlockedScreens(user('partner'), ctx())).toEqual([])
  })

  it('gives a linked partner Prodaja and Obračun, both built by #505', () => {
    expect(keys(unlockedScreens(user('partner'), ctx({ hasPartner: true })))).toEqual([
      'sell',
      'statement',
    ])
  })

  it('gives refunds + dev alone nothing', () => {
    expect(unlockedScreens(user('refunds', 'dev'), ctx())).toEqual([])
  })

  it('gives a voditelj Izvedbe, Članovi and Ljestvica without any Member link', () => {
    expect(keys(unlockedScreens(user('moreska'), ctx()))).toEqual([
      'performances',
      'members',
      'leaderboard',
    ])
  })

  it('gives a tickets holder every blagajna screen built so far', () => {
    // Narudžbe landed with #501, the blagajna's half of Izvedbe with #502,
    // Upiti with #507, Gratis with #506 and Statistika with #508 — which is
    // every screen `tickets` unlocks, so this list stops growing here.
    expect(keys(unlockedScreens(user('tickets', 'refunds'), ctx()))).toEqual([
      'orders',
      'performances',
      'inquiries',
      'comp',
      'stats',
    ])
  })

  it('keeps Upiti to the blagajna, whatever else an account holds', () => {
    // The page gate is this table (`openScreen('inquiries')` asks it), so the
    // refusal of the enquiry inbox for every non-`tickets` account is asserted
    // here rather than in a rendered page.
    const others: [ReturnType<typeof user>, ReturnType<typeof ctx>][] = [
      [user('door'), ctx()],
      [user('partner'), ctx({ hasPartner: true })],
      [user('moreskant'), ctx({ hasMember: true })],
      [user('moreska'), ctx()],
      [user('season_stats', 'finance', 'refunds', 'dev'), ctx()],
    ]
    for (const [who, where] of others) {
      expect(keys(unlockedScreens(who, where))).not.toContain('inquiries')
    }
    expect(keys(unlockedScreens(user('tickets'), ctx()))).toContain('inquiries')
  })

  it('gives the shared member login Statistika and NOTHING else', () => {
    // `season_stats` is the whole permission set of the society's shared
    // `member` account (ADR-0022). One screen, no orders, no buyers, no money.
    expect(keys(unlockedScreens(user('season_stats'), ctx()))).toEqual(['stats'])
  })

  it('gives a finance holder the season in counts and the season in euros', () => {
    // Statistika (#508) and Financije (#509) are the pair, and the split
    // between them is the point: counts on one, cents on the other.
    expect(keys(unlockedScreens(user('finance'), ctx()))).toEqual(['stats', 'finance'])
  })

  it('gives the president Skener, Statistika and Financije, and no way into Izvedbe', () => {
    // Velebit is `finance` + `door` (#500). The pair unlocks the gate and both
    // season screens, and NEITHER word unlocks Izvedbe — which is what makes
    // every row on Statistika link-less for him (#508), and what makes his old
    // `/admin/stats/[id]` bookmark land on the refusal page once that path
    // 308s to `/app/performances/[id]`.
    expect(keys(unlockedScreens(user('finance', 'door'), ctx()))).toEqual([
      'scan',
      'stats',
      'finance',
    ])
  })

  it('gives a door-only account no Statistika at all', () => {
    expect(keys(unlockedScreens(user('door'), ctx()))).toEqual(['scan'])
  })

  it('never lets an unknown permission string unlock anything', () => {
    expect(unlockedScreens({ permissions: ['superadmin'] }, ctx({ hasMember: true }))).toEqual([])
  })
})

describe('appNav', () => {
  it('puts the dance first for a moreskant holder and lands there', () => {
    const nav = appNav(user('moreskant'), ctx({ hasMember: true }))
    expect(keys(nav.tabs)).toEqual(['performances', 'leaderboard', 'more'])
    expect(nav.landing).toBe('/app/performances')
    expect(nav.overflow).toEqual([])
  })

  it('always ends the bar with Više, and never counts it against the three', () => {
    const nav = appNav(user('moreska'), ctx())
    expect(nav.tabs.at(-1)?.key).toBe('more')
    expect(nav.tabs.filter((t) => t.key !== 'more').length).toBeLessThanOrEqual(MAX_TABS)
  })

  it('has no tabs and no landing screen for an account that unlocks nothing', () => {
    // `refunds` unlocks no screen by design (a refund is an action inside an
    // order) and `dev` unlocks the diagnostics strip rather than a screen, so
    // holding both is a signed-in account with nowhere to be.
    const nav = appNav(user('refunds', 'dev'), ctx())
    expect(nav.tabs).toEqual([])
    expect(nav.landing).toBeNull()
  })

  it('lands a `users` holder on Korisnici, which #510 built', () => {
    const nav = appNav(user('users', 'refunds'), ctx())
    expect(nav.tabs.map((t) => t.key)).toEqual(['users', 'more'])
    expect(nav.landing).toBe('/app/users')
  })

  it('lands the shared member login on Statistika, its only screen', () => {
    // The `season_stats` bundle (ADR-0022) is one tab plus Više, and the
    // laptop's sidebar shows it under Uprava. Nothing else is reachable, which
    // is the whole point of a login the society shares.
    const nav = appNav(user('season_stats'), ctx())
    expect(nav.tabs.map((t) => t.key)).toEqual(['stats', 'more'])
    expect(nav.overflow).toEqual([])
    expect(nav.landing).toBe('/app/stats')
    expect(nav.groups.map((g) => [g.group, g.screens.map((s) => s.key)])).toEqual([
      ['admin', ['stats']],
    ])
  })

  it('caps the bar at three screens and pushes the rest into Više', () => {
    // The cap is exercised against the TARGET table, so it is tested before the
    // screens that will fill the bar exist: the same merge, run over every
    // screen a full set unlocks.
    const nav = appNav(user('users', 'tickets', 'door', 'partner', 'moreska', 'moreskant'), {
      hasMember: true,
      hasPartner: true,
      target: true,
    })
    // Dancer first (Moreška, Ljestvica), then the voditelj's Članovi; the
    // blagajna's three and everything else are one tap away in Više.
    expect(keys(nav.tabs)).toEqual(['performances', 'leaderboard', 'members', 'more'])
    expect(keys(nav.overflow)).toEqual([
      'orders',
      'scan',
      'sell',
      'statement',
      'inquiries',
      'comp',
      'users',
      'stats',
    ])
    expect(nav.landing).toBe('/app/performances')
  })

  it('gives the secretary who also works the door the box\u2019s three', () => {
    const nav = appNav(user('tickets', 'refunds', 'door'), { ...ctx(), target: true })
    expect(keys(nav.tabs)).toEqual(['orders', 'performances', 'inquiries', 'more'])
    expect(keys(nav.overflow)).toEqual(['scan', 'comp', 'stats'])
    expect(nav.landing).toBe('/app/orders')
  })

  it('gives a partner its two screens and nothing else', () => {
    const nav = appNav(user('partner'), { hasMember: false, hasPartner: true, target: true })
    expect(keys(nav.tabs)).toEqual(['sell', 'statement', 'more'])
    expect(nav.landing).toBe('/app/sell')
  })
})

// The per-account bar (#563, decisions Q52/Q56/Q57/Q60). Three screens belong
// to the ACCOUNT: a `users` holder picks them on Korisnici, and everybody
// nobody has picked for reads the generic order below.
//
// Every expectation here that names Izvedbe for "Moreška" is waiting on T4
// (#565): the Moreška screen is not in the table yet, so the generic order maps
// that name onto `performances` and these tests move with it when it lands.
describe('the generic order', () => {
  const generic = (held: Permission[], over: Parameters<typeof ctx>[0] = {}) =>
    genericTabs(unlockedScreens(user(...held), { ...ctx(over), target: true }), held)

  it('gives every permission that opens a screen the bar its holder came for', () => {
    // The table from the decision, one row per permission, and nothing else in
    // this file is allowed to re-type it.
    expect(generic(['moreskant'], { hasMember: true })).toEqual(['performances', 'leaderboard'])
    expect(generic(['moreska'])).toEqual(['performances', 'members', 'leaderboard'])
    expect(generic(['tickets'])).toEqual(['orders', 'performances', 'inquiries'])
    expect(generic(['door'])).toEqual(['scan'])
    expect(generic(['partner'], { hasPartner: true })).toEqual(['sell', 'statement'])
    expect(generic(['season_stats'])).toEqual(['stats'])
    expect(generic(['finance'])).toEqual(['finance', 'stats'])
  })

  it('merges a multi-permission set dancer → box → other, first three winning', () => {
    // A voditelj who also works the till opens the app on the dance: the half
    // only they can do comes first, and the box is one tap away in Više.
    expect(generic(['tickets', 'moreskant'], { hasMember: true })).toEqual([
      'performances',
      'leaderboard',
      'orders',
    ])
    expect(generic(['finance', 'tickets'])).toEqual(['orders', 'performances', 'inquiries'])
    expect(generic(['door', 'season_stats'])).toEqual(['scan', 'stats'])
  })

  it('collapses a duplicate rather than spending a tab on it twice', () => {
    // Until T4, Moreška and Izvedbe are the same screen for a voditelj, so the
    // third tab comes from the top-up rather than from a repeated key.
    expect(generic(['moreska'])).toEqual(['performances', 'members', 'leaderboard'])
  })

  it('tops the bar up in rank order for a set the table has no row for', () => {
    // `users` opens Korisnici and has no generic row of its own: a one-screen
    // bar is still a bar, and a second screen joins it by rank rather than
    // leaving a tab empty while Više carries something the person holds.
    expect(generic(['users', 'refunds'])).toEqual(['users'])
    expect(generic(['users', 'season_stats'])).toEqual(['stats', 'users'])
  })

  it('offers nothing for a set that unlocks nothing', () => {
    expect(generic(['refunds', 'dev'])).toEqual([])
  })

  it('never offers a screen the account does not unlock', () => {
    // `moreskant` without a live Member is stripped before the table is read,
    // so its generic bar is empty rather than two screens that would 403.
    expect(generic(['moreskant'])).toEqual([])
  })
})

describe('a chosen bar', () => {
  const holder = user('tickets', 'refunds')

  it('wins over the generic order, in the order it was chosen', () => {
    const nav = appNav(holder, ctx(), ['inquiries', 'stats', 'orders'])
    expect(keys(nav.tabs)).toEqual(['inquiries', 'stats', 'orders', 'more'])
    expect(nav.landing).toBe('/app/inquiries')
    // Everything else the account unlocks is still reachable under Više.
    expect(keys(nav.overflow)).toEqual(['performances', 'comp'])
  })

  it('drops a key the permission set does not unlock rather than obeying it', () => {
    // A bar is an order, never a permission: `finance` was taken away and the
    // stored key goes with it, on the next request and with no migration.
    const nav = appNav(holder, ctx(), ['finance', 'orders'])
    expect(keys(nav.tabs)).toEqual(['orders', 'more'])
  })

  it('falls back to the generic order when every stored key is stale', () => {
    const nav = appNav(holder, ctx(), ['finance'])
    expect(keys(nav.tabs)).toEqual(['orders', 'performances', 'inquiries', 'more'])
  })

  it('never carries more than three, whatever was stored', () => {
    const nav = appNav(holder, ctx(), ['orders', 'performances', 'inquiries', 'comp', 'stats'])
    expect(keys(nav.tabs)).toEqual(['orders', 'performances', 'inquiries', 'more'])
  })

  it('spends a tab once on a key that was stored twice', () => {
    const nav = appNav(holder, ctx(), ['orders', 'orders', 'comp'])
    expect(keys(nav.tabs)).toEqual(['orders', 'comp', 'more'])
  })
})

describe('tabKeysOf', () => {
  it('reads a stored list leniently: this is a row, not a form', () => {
    expect(tabKeysOf(['orders', 'stats'])).toEqual(['orders', 'stats'])
    expect(tabKeysOf(['orders', 'pozivnice', 42, null])).toEqual(['orders'])
    expect(tabKeysOf(['orders', 'orders'])).toEqual(['orders'])
    expect(tabKeysOf(['orders', 'comp', 'stats', 'inquiries'])).toHaveLength(MAX_TABS)
  })

  it('reads anything that is not a list as no choice at all', () => {
    expect(tabKeysOf(null)).toEqual([])
    expect(tabKeysOf(undefined)).toEqual([])
    expect(tabKeysOf('orders')).toEqual([])
    expect(tabKeysOf({ 0: 'orders' })).toEqual([])
  })

  it('never accepts Više, which is the last tab and never a chosen one', () => {
    expect(isTabKey('more')).toBe(false)
    expect(tabKeysOf(['more', 'orders'])).toEqual(['orders'])
  })

  it('accepts every key the table has and nothing else', () => {
    for (const screen of APP_SCREENS) expect(isTabKey(screen.key)).toBe(true)
    expect(isTabKey('home')).toBe(false)
  })
})

describe('the laptop sidebar', () => {
  it('groups a full permission set by workspace, each screen in one group only', () => {
    const nav = appNav(user('users', 'tickets', 'door', 'partner', 'moreska', 'moreskant', 'finance'), {
      hasMember: true,
      hasPartner: true,
      target: true,
    })
    expect(nav.groups.map((g) => [g.group, keys(g.screens)])).toEqual([
      ['moreskant', ['performances', 'members', 'leaderboard']],
      ['box', ['orders', 'inquiries', 'comp']],
      ['partner', ['sell', 'statement']],
      ['door', ['scan']],
      ['admin', ['users', 'stats', 'finance']],
    ])
  })

  it('keeps Statistika in Blagajna when there is no Uprava group', () => {
    const nav = appNav(user('tickets'), { ...ctx(), target: true })
    expect(nav.groups.map((g) => [g.group, keys(g.screens)])).toEqual([
      ['box', ['orders', 'performances', 'inquiries', 'comp', 'stats']],
    ])
  })

  it('shows no empty group', () => {
    const nav = appNav(user('moreskant'), ctx({ hasMember: true }))
    expect(nav.groups.map((g) => g.group)).toEqual(['moreskant'])
    for (const group of nav.groups) expect(group.screens.length).toBeGreaterThan(0)
  })
})

describe('activeTabKey', () => {
  // Tatjana's bar (#563): three chosen screens, everything else under Više.
  const nav = appNav(user('tickets'), ctx(), ['orders', 'stats', 'inquiries'])

  it('lights the tab you are on', () => {
    expect(activeTabKey(nav, '/app/orders')).toBe('orders')
    expect(activeTabKey(nav, '/app/orders/42')).toBe('orders')
    expect(activeTabKey(nav, '/app/stats?season=2026')).toBe('stats')
  })

  it('lights Više for a screen the bar does not carry', () => {
    // The everyday case now that a bar is three screens: Gratis and the
    // performance detail are both one tap into Više, and a bar that lit nothing
    // would tell the reader they are nowhere.
    expect(activeTabKey(nav, '/app/comp')).toBe('more')
    expect(activeTabKey(nav, '/app/performances/42')).toBe('more')
  })

  it('lights Više for Više itself and for the rows under it', () => {
    expect(activeTabKey(nav, '/app/more')).toBe('more')
    expect(activeTabKey(nav, '/app/notifications')).toBe('more')
    expect(activeTabKey(nav, '/app/account')).toBe('more')
  })

  it('lights nothing on a page with no bar, or on a screen this account cannot open', () => {
    expect(activeTabKey(nav, '/app/login')).toBeNull()
    expect(activeTabKey(nav, '/app/welcome')).toBeNull()
    // Financije answers to `finance`; this account never reaches it, so there
    // is nothing honest to light.
    expect(activeTabKey(nav, '/app/finance')).toBeNull()
  })

  it('lights nothing at all for an account with no bar', () => {
    const nowhere = appNav(user('refunds'), ctx())
    expect(activeTabKey(nowhere, '/app/orders')).toBeNull()
  })
})

describe('activeScreenKey', () => {
  it('lights a screen from its own route and from anything below it', () => {
    expect(activeScreenKey('/app/performances')).toBe('performances')
    expect(activeScreenKey('/app/performances/42')).toBe('performances')
    expect(activeScreenKey('/app/leaderboard?season=2026')).toBe('leaderboard')
    expect(activeScreenKey('/app/more')).toBe('more')
  })

  it('does not light a screen whose route is only a prefix of the path', () => {
    expect(activeScreenKey('/app/performances-archive')).toBeNull()
  })

  it('lights Članovi on a dancer’s profile, not only on the list (#511)', () => {
    expect(activeScreenKey('/app/members')).toBe('members')
    expect(activeScreenKey('/app/members/4')).toBe('members')
  })

  it('lights nothing on the retired Pozivnice path, which now 308s away (#511)', () => {
    // It was a Više row until Članovi absorbed it; a stale bookmark is a 308
    // before any bar is rendered, so no tab should claim the path.
    expect(activeScreenKey('/app/invitations')).toBeNull()
  })

  it('lights Više for the rows that live under it', () => {
    expect(activeScreenKey('/app/account')).toBe('more')
    expect(activeScreenKey('/app/calendar')).toBe('more')
    expect(activeScreenKey('/app/notifications')).toBe('more')
  })

  it('lights nothing on a page that carries no bar', () => {
    expect(activeScreenKey('/app/login')).toBeNull()
    expect(activeScreenKey('/app/session')).toBeNull()
    expect(activeScreenKey('/app/authorize')).toBeNull()
    expect(activeScreenKey('/app/welcome')).toBeNull()
    expect(activeScreenKey('/app/install')).toBeNull()
    expect(activeScreenKey('/app')).toBeNull()
  })
})

describe('screenForPath', () => {
  it('finds the screen a route belongs to, so a page can gate on it', () => {
    expect(screenForPath('/app/performances/42')?.key).toBe('performances')
    expect(screenForPath('/app/scan')?.key).toBe('scan')
    expect(screenForPath('/app/login')).toBeNull()
  })
})

describe('screenByKey', () => {
  it('resolves every key in the table, Više included', () => {
    expect(screenByKey('more')).toBe(MORE_SCREEN)
    expect(screenByKey('orders').route).toBe('/app/orders')
  })
})
