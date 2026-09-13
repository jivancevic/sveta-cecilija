import { describe, expect, it } from 'vitest'
import type { Permission } from '@/lib/access/permissions'
import {
  APP_SCREENS,
  MORE_SCREEN,
  activeScreenKey,
  appNav,
  screenByKey,
  screenForPath,
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
  it('puts Izvedbe first for a moreskant holder and lands there', () => {
    const nav = appNav(user('moreskant'), ctx({ hasMember: true }))
    expect(keys(nav.tabs)).toEqual(['performances', 'leaderboard', 'more'])
    expect(nav.landing).toBe('/app/performances')
    expect(nav.overflow).toEqual([])
  })

  it('always ends the bar with Više, and never counts it against the four', () => {
    const nav = appNav(user('moreska'), ctx())
    expect(nav.tabs.at(-1)?.key).toBe('more')
    expect(nav.tabs.filter((t) => t.key !== 'more').length).toBeLessThanOrEqual(4)
  })

  it('has no tabs and no landing screen for an account that unlocks nothing', () => {
    // `users` is the widest set that still unlocks nothing built: Korisnici
    // (#510) is an empty column, and `refunds` unlocks no screen by design (a
    // refund is an action inside an order).
    const nav = appNav(user('users', 'refunds'), ctx())
    expect(nav.tabs).toEqual([])
    expect(nav.landing).toBeNull()
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

  it('caps the bar at four screens and pushes the rest into Više', () => {
    // The cap is exercised against the TARGET table, so it is tested before the
    // screens that will fill the bar exist: the same ranking, run over every
    // screen a full set unlocks.
    const nav = appNav(user('users', 'tickets', 'door', 'partner', 'moreska', 'moreskant'), {
      hasMember: true,
      hasPartner: true,
      target: true,
    })
    expect(keys(nav.tabs)).toEqual(['performances', 'orders', 'members', 'leaderboard', 'more'])
    expect(keys(nav.overflow)).toEqual([
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

  it('ranks Narudžbe first for the secretary, who does not dance', () => {
    const nav = appNav(user('tickets', 'refunds', 'door'), { ...ctx(), target: true })
    expect(keys(nav.tabs)).toEqual(['orders', 'performances', 'scan', 'inquiries', 'more'])
    expect(keys(nav.overflow)).toEqual(['comp', 'stats'])
    expect(nav.landing).toBe('/app/orders')
  })

  it('gives a partner its two screens and nothing else', () => {
    const nav = appNav(user('partner'), { hasMember: false, hasPartner: true, target: true })
    expect(keys(nav.tabs)).toEqual(['sell', 'statement', 'more'])
    expect(nav.landing).toBe('/app/sell')
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
