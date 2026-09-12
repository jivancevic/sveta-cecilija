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
    expect(keys(live)).toEqual(['performances', 'leaderboard'])
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

  it('gives refunds + dev alone nothing', () => {
    expect(unlockedScreens(user('refunds', 'dev'), ctx())).toEqual([])
  })

  it('gives a voditelj Izvedbe and Ljestvica without any Member link', () => {
    expect(keys(unlockedScreens(user('moreska'), ctx()))).toEqual(['performances', 'leaderboard'])
  })

  it('gives a tickets holder nothing until the blagajna screens are built', () => {
    // Narudžbe, Upiti, Gratis and Statistika are ticketed separately (#501,
    // #507, #506, #508) and Izvedbe serves the blagajna only from #502.
    expect(unlockedScreens(user('tickets', 'refunds'), ctx())).toEqual([])
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
    const nav = appNav(user('door'), ctx())
    expect(nav.tabs).toEqual([])
    expect(nav.landing).toBeNull()
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

  it('lights Više for the rows that live under it', () => {
    expect(activeScreenKey('/app/account')).toBe('more')
    expect(activeScreenKey('/app/invitations')).toBe('more')
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
