import { describe, expect, it } from 'vitest'
import type { Permission } from '@/lib/access/permissions'
import {
  APP_SCREENS,
  HOME_SCREEN,
  MAX_TABS,
  MORE_SCREEN,
  activeScreenKey,
  activeTabKey,
  appNav,
  genericTabs,
  isTabKey,
  screenByKey,
  screenForPath,
  slideDirection,
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
      'moreska',
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
    // The two fixed ends of the bar are outside the table on purpose: neither
    // is ranked, neither overflows, and neither may be stored on `Users.tabs`.
    expect(keys(APP_SCREENS)).not.toContain('home')
    expect(keys(APP_SCREENS)).not.toContain('more')
    expect(HOME_SCREEN.route).toBe('/app')
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
      'moreska',
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
  it('gives a dancer with a live Member row Moreška and Ljestvica, never Izvedbe', () => {
    // #565: Izvedbe is the blagajna's schedule now, in the selling register.
    // The dancer reads the same evenings on Moreška, as "nastupi".
    expect(keys(unlockedScreens(user('moreskant'), ctx({ hasMember: true })))).toEqual([
      'moreska',
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

  it('gives a voditelj Moreška, Izvedbe, Članovi and Ljestvica without any Member link', () => {
    // A voditelj who does not dance still leads the roster, so Moreška is
    // theirs to read (#565); the hero simply carries no answer of their own.
    expect(keys(unlockedScreens(user('moreska'), ctx()))).toEqual([
      'moreska',
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
  it('puts Moreška first for a moreskant holder and lands there', () => {
    const nav = appNav(user('moreskant'), ctx({ hasMember: true }))
    expect(keys(nav.tabs)).toEqual(['home', 'moreska', 'leaderboard', 'more'])
    // Since T3 every account lands on Početna; the dance is the tab beside it.
    expect(nav.landing).toBe('/app')
    expect(nav.overflow).toEqual([])
  })

  it('never offers a moreskant-only login Izvedbe, in the bar or in Više (#565)', () => {
    // Under #563 the overflow is "everything unlocked minus the tabs", so this
    // asserts the TABLE and not a bar order: a dancer does not unlock Izvedbe
    // at all, and there is nowhere left for it to appear.
    const nav = appNav(user('moreskant'), ctx({ hasMember: true }))
    expect([...keys(nav.tabs), ...keys(nav.overflow)]).not.toContain('performances')
    for (const group of nav.groups) expect(keys(group.screens)).not.toContain('performances')
  })

  it('opens the bar with Početna and ends it with Više, neither counted', () => {
    const nav = appNav(user('moreska'), ctx())
    expect(nav.tabs[0]?.key).toBe('home')
    expect(nav.tabs.at(-1)?.key).toBe('more')
    const chosen = nav.tabs.filter((t) => t.key !== 'more' && t.key !== 'home')
    expect(chosen.length).toBeLessThanOrEqual(MAX_TABS)
    // Five entries at most: Početna + three + Više, which is what the pill's
    // `--n` is handed and what a phone has room for (#564).
    expect(nav.tabs.length).toBeLessThanOrEqual(MAX_TABS + 2)
  })

  it('never puts Početna in Više, and never in the chosen three', () => {
    const nav = appNav(user('tickets'), ctx())
    expect(keys(nav.overflow)).not.toContain('home')
    expect(nav.tabs.filter((t) => t.key === 'home')).toHaveLength(1)
    expect(screenByKey('home')).toBe(HOME_SCREEN)
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
    expect(nav.tabs.map((t) => t.key)).toEqual(['home', 'users', 'more'])
    expect(nav.landing).toBe('/app')
  })

  it('lands the shared member login on Statistika, its only screen', () => {
    // The `season_stats` bundle (ADR-0022) is one tab plus Više, and the
    // laptop's sidebar shows it under Uprava. Nothing else is reachable, which
    // is the whole point of a login the society shares.
    const nav = appNav(user('season_stats'), ctx())
    expect(nav.tabs.map((t) => t.key)).toEqual(['home', 'stats', 'more'])
    expect(nav.overflow).toEqual([])
    expect(nav.landing).toBe('/app')
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
    expect(keys(nav.tabs)).toEqual(['home', 'moreska', 'leaderboard', 'members', 'more'])
    expect(keys(nav.overflow)).toEqual([
      'orders',
      'performances',
      'scan',
      'sell',
      'statement',
      'inquiries',
      'comp',
      'users',
      'stats',
    ])
    expect(nav.landing).toBe('/app')
  })

  it('gives the secretary who also works the door the box\u2019s three', () => {
    const nav = appNav(user('tickets', 'refunds', 'door'), { ...ctx(), target: true })
    expect(keys(nav.tabs)).toEqual(['home', 'orders', 'performances', 'inquiries', 'more'])
    expect(keys(nav.overflow)).toEqual(['scan', 'comp', 'stats'])
    expect(nav.landing).toBe('/app')
  })

  it('gives a partner its two screens and nothing else', () => {
    const nav = appNav(user('partner'), { hasMember: false, hasPartner: true, target: true })
    expect(keys(nav.tabs)).toEqual(['home', 'sell', 'statement', 'more'])
    expect(nav.landing).toBe('/app')
  })
})

// The per-account bar (#563, decisions Q52/Q56/Q57/Q60). Three screens belong
// to the ACCOUNT: a `users` holder picks them on Korisnici, and everybody
// nobody has picked for reads the generic order below.
//
// Since T4 (#565) "Moreška" in these rows is the Moreška SCREEN and not a stand
// -in for Izvedbe, which is the difference between a dancer's bar and a
// voditelj's: a `moreskant` does not unlock Izvedbe at all any more.
describe('the generic order', () => {
  const generic = (
    held: Permission[],
    over: Parameters<typeof ctx>[0] = {},
    target = true,
  ) => genericTabs(unlockedScreens(user(...held), { ...ctx(over), target }), held)

  it('gives every permission that opens a screen the bar its holder came for', () => {
    // The table from the decision, one row per permission, and nothing else in
    // this file is allowed to re-type it.
    // The dancer's row is read over the BUILT table, and deliberately: the
    // route map's `performances.unlockedBy` still carries `moreskant` (#565
    // only moved it out of `servesToday`), so in target mode the top-up would
    // hand a dancer Izvedbe as a third tab — a screen the redesign says they
    // never see. Retiring that word from `unlockedBy` is the day this line can
    // go back to target mode; until then, what SHIPS is what this asserts.
    expect(generic(['moreskant'], { hasMember: true }, false)).toEqual([
      'moreska',
      'leaderboard',
    ])
    expect(generic(['moreska'])).toEqual(['moreska', 'members', 'performances'])
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
      'moreska',
      'leaderboard',
      'orders',
    ])
    expect(generic(['finance', 'tickets'])).toEqual(['orders', 'performances', 'inquiries'])
    expect(generic(['door', 'season_stats'])).toEqual(['scan', 'stats'])
  })

  it('collapses a duplicate rather than spending a tab on it twice', () => {
    // Statistika is on both rows: `season_stats` is the whole of it, and
    // `finance` lists it after the money. A set holding both must not spend two
    // of its three tabs on one screen, and with nothing else unlocked the bar
    // is honestly two long rather than padded to three.
    //
    // `season_stats` is merged first (it is earlier in GENERIC_MERGE), so it
    // lays down Statistika and `finance` adds only the screen Statistika is
    // not. Two tabs, not three, and Statistika appears once.
    expect(generic(['season_stats', 'finance'])).toEqual(['stats', 'finance'])
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
    expect(keys(nav.tabs)).toEqual(['home', 'inquiries', 'stats', 'orders', 'more'])
    expect(nav.landing).toBe('/app')
    // Everything else the account unlocks is still reachable under Više.
    expect(keys(nav.overflow)).toEqual(['performances', 'comp'])
  })

  it('drops a key the permission set does not unlock rather than obeying it', () => {
    // A bar is an order, never a permission: `finance` was taken away and the
    // stored key goes with it, on the next request and with no migration.
    const nav = appNav(holder, ctx(), ['finance', 'orders'])
    expect(keys(nav.tabs)).toEqual(['home', 'orders', 'more'])
  })

  it('falls back to the generic order when every stored key is stale', () => {
    const nav = appNav(holder, ctx(), ['finance'])
    expect(keys(nav.tabs)).toEqual(['home', 'orders', 'performances', 'inquiries', 'more'])
  })

  it('never carries more than three, whatever was stored', () => {
    const nav = appNav(holder, ctx(), ['orders', 'performances', 'inquiries', 'comp', 'stats'])
    expect(keys(nav.tabs)).toEqual(['home', 'orders', 'performances', 'inquiries', 'more'])
  })

  it('spends a tab once on a key that was stored twice', () => {
    const nav = appNav(holder, ctx(), ['orders', 'orders', 'comp'])
    expect(keys(nav.tabs)).toEqual(['home', 'orders', 'comp', 'more'])
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
      ['moreskant', ['moreska', 'performances', 'members', 'leaderboard']],
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

  it('lights Početna on the landing screen, which every bar carries', () => {
    expect(activeTabKey(nav, '/app')).toBe('home')
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

  // Izvedbe's own detail: the blagajna's and the voditelj's evening.
  it('lights Izvedbe for a voditelj reading one evening, because it is their tab', () => {
    const voditelj = appNav(user('moreska'), ctx())
    expect(keys(voditelj.tabs)).toEqual(['home', 'moreska', 'members', 'performances', 'more'])
    expect(activeTabKey(voditelj, '/app/performances/42')).toBe('performances')
  })

  it('lights NOTHING for a dancer on the Izvedbe detail, which is not their path', () => {
    // A `moreskant` does not unlock Izvedbe at all since #565, and since #566
    // has no reason to be there: Stanje is `/app/moreska/[id]`, the gate on the
    // Izvedbe detail is back to `openScreen('performances')` and every push
    // deep link points at Stanje. A bar that lit Više here would be a lie,
    // because the page is not reachable from it and would refuse them anyway.
    const dancer = appNav(user('moreskant'), ctx({ hasMember: true }))
    expect(keys(dancer.tabs)).toEqual(['home', 'moreska', 'leaderboard', 'more'])
    expect(activeTabKey(dancer, '/app/performances/42')).toBeNull()
    expect(activeTabKey(dancer, '/app/moreska')).toBe('moreska')
  })

  // #566 — Stanje is under Moreška, so the prefix rule lights the tab a dancer
  // and a voditelj are both actually on. Nothing was added to the table for it:
  // a screen's route covers everything below it, and that is the point.
  it('lights Moreška on Stanje, for a dancer and for a voditelj alike', () => {
    const dancer = appNav(user('moreskant'), ctx({ hasMember: true }))
    const voditelj = appNav(user('moreska'), ctx())
    expect(activeTabKey(dancer, '/app/moreska/42')).toBe('moreska')
    expect(activeTabKey(voditelj, '/app/moreska/42')).toBe('moreska')
  })

  // The same prefix rule, one screen over (#568).
  it('keeps Ljestvica lit on its full list', () => {
    const dancer = appNav(user('moreskant'), ctx({ hasMember: true }))
    expect(activeTabKey(dancer, '/app/leaderboard/full?season=2026&kind=moreska')).toBe(
      'leaderboard',
    )
  })
})

describe('activeScreenKey', () => {
  it('lights a screen from its own route and from anything below it', () => {
    expect(activeScreenKey('/app/performances')).toBe('performances')
    expect(activeScreenKey('/app/performances/42')).toBe('performances')
    expect(activeScreenKey('/app/leaderboard?season=2026')).toBe('leaderboard')
    expect(activeScreenKey('/app/more')).toBe('more')
  })

  it('lights Ljestvica on the full list under it (#568)', () => {
    expect(activeScreenKey('/app/leaderboard/full')).toBe('leaderboard')
    expect(activeScreenKey('/app/leaderboard/full?season=2026&kind=experience')).toBe(
      'leaderboard',
    )
  })

  it('does not light a screen whose route is only a prefix of the path', () => {
    expect(activeScreenKey('/app/performances-archive')).toBeNull()
  })

  it('lights Moreška on Stanje as well as on the schedule (#566)', () => {
    expect(activeScreenKey('/app/moreska')).toBe('moreska')
    expect(activeScreenKey('/app/moreska/42')).toBe('moreska')
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
  })

  it('lights Početna on /app itself, and only there (#564)', () => {
    // `/app` is a prefix of every route in the table, so the match has to be
    // exact: a prefix test here would light Početna on all twelve screens.
    expect(activeScreenKey('/app')).toBe('home')
    expect(activeScreenKey('/app/')).toBe('home')
    expect(activeScreenKey('/app?x=1')).toBe('home')
    expect(activeScreenKey('/app/orders')).toBe('orders')
    expect(screenForPath('/app')?.key).toBe('home')
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
  it('resolves every key in the table, Početna and Više included', () => {
    expect(screenByKey('home')).toBe(HOME_SCREEN)
    expect(screenByKey('more')).toBe(MORE_SCREEN)
    expect(screenByKey('orders').route).toBe('/app/orders')
  })
})

describe('which way a screen arrives from (#593)', () => {
  it('comes in from the right when the tab is further right', () => {
    expect(slideDirection(0, 1)).toBe('right')
    expect(slideDirection(1, 4)).toBe('right')
  })

  it('comes in from the left when the tab is further left', () => {
    expect(slideDirection(4, 1)).toBe('left')
    expect(slideDirection(1, 0)).toBe('left')
  })

  it('does not slide backwards onto the tab it is already on', () => {
    // A refresh, or a filter in the query string: the same tab both times.
    expect(slideDirection(2, 2)).toBe('right')
  })

  it('brings a screen the bar does not carry in from the right, both ways', () => {
    // Into an order: a step forward out of a list.
    expect(slideDirection(1, -1)).toBe('right')
    // And back out of it, where the browser own Back is the gesture.
    expect(slideDirection(-1, 1)).toBe('right')
    expect(slideDirection(-1, -1)).toBe('right')
  })
})
