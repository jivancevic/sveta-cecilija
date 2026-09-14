import { describe, expect, it, vi } from 'vitest'
import { MAX_TABS } from './screens'
import { APP_STRINGS } from './strings'
import { handleSetTabs, parseTabKeys, type SetTabsDeps, type TabsTarget } from './users-tabs'

// The sixth Korisnici write (#563): which three screens an account opens on.
//
// The three refusals worth a test each are the ones no other write on this
// screen has: a key the account does not unlock is refused rather than stored
// (400), and a bar is still a real answer when it is empty (200, back to the
// generic order). The own-row 409 Q52 asked for is gone since #591: a `users`
// holder arranges any bar, their own included.

const S = APP_STRINGS.users

const SAME_SITE = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function target(over: Partial<TabsTarget> = {}): TabsTarget {
  return {
    id: '7',
    permissions: ['tickets', 'refunds'],
    ctx: { hasMember: false, hasPartner: false },
    ...over,
  }
}

function deps(over: Partial<SetTabsDeps> = {}): SetTabsDeps {
  return {
    request: SAME_SITE,
    caller: { id: '1', shared: false },
    loadTarget: async () => target(),
    save: vi.fn(async () => {}),
    ...over,
  }
}

describe('parseTabKeys', () => {
  it('keeps the order it was given, because the order IS the bar', () => {
    expect(parseTabKeys(['inquiries', 'orders'])).toEqual({ keys: ['inquiries', 'orders'] })
  })

  it('reads an empty list as a real answer: back to the generic order', () => {
    expect(parseTabKeys([])).toEqual({ keys: [] })
  })

  it('refuses a fourth key rather than silently keeping three', () => {
    expect(parseTabKeys(['orders', 'performances', 'inquiries', 'comp'])).toEqual({
      error: S.tabs.tooMany(MAX_TABS),
    })
  })

  it('refuses the same screen twice, which would be a bar with a hole in it', () => {
    expect(parseTabKeys(['orders', 'orders'])).toEqual({ error: S.tabs.duplicate })
  })

  it('refuses anything that is not a screen key, Više included', () => {
    expect(parseTabKeys(['orders', 'pozivnice'])).toEqual({ error: S.tabs.invalid })
    expect(parseTabKeys(['more'])).toEqual({ error: S.tabs.invalid })
    expect(parseTabKeys('orders')).toEqual({ error: S.tabs.invalid })
    expect(parseTabKeys(null)).toEqual({ error: S.tabs.invalid })
  })
})

describe('handleSetTabs', () => {
  it('saves the three screens in the order they were chosen', async () => {
    const save = vi.fn(async () => {})
    const res = await handleSetTabs('7', { tabs: ['inquiries', 'orders'] }, deps({ save }))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, tabs: ['inquiries', 'orders'], message: S.tabs.saved })
    expect(save).toHaveBeenCalledWith('7', ['inquiries', 'orders'])
  })

  it('clears a bar back to the generic order, and says that is what happened', async () => {
    const save = vi.fn(async () => {})
    const res = await handleSetTabs('7', { tabs: [] }, deps({ save }))
    expect(res.status).toBe(200)
    expect(res.body.message).toBe(S.tabs.cleared)
    expect(save).toHaveBeenCalledWith('7', [])
  })

  it('lets a `users` holder arrange their OWN bar (#591)', async () => {
    // Q52 refused this row with a 409. #591 reverses it for exactly this case:
    // there is one `users` holder in this society, so "ask the other one" was
    // an instruction with nobody on the far end of it. Everything else about
    // the write is unchanged, which is what the refusals below still assert.
    const save = vi.fn(async () => {})
    const res = await handleSetTabs(
      '1',
      { tabs: ['orders'] },
      deps({ loadTarget: async () => target({ id: '1' }), save }),
    )
    expect(res.status).toBe(200)
    expect(save).toHaveBeenCalledWith('1', ['orders'])
  })

  it('still validates the caller\'s own body like anybody else\'s', async () => {
    const save = vi.fn(async () => {})
    const res = await handleSetTabs(
      '1',
      { tabs: 'orders' },
      deps({ loadTarget: async () => target({ id: '1' }), save }),
    )
    expect(res.status).toBe(400)
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses a screen this account does not unlock (400), and names it', async () => {
    // A tab is an order, never a permission: Financije answers to `finance`
    // and this account does not hold it.
    const save = vi.fn(async () => {})
    const res = await handleSetTabs('7', { tabs: ['orders', 'finance'] }, deps({ save }))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(S.tabs.locked(APP_STRINGS.screens.finance))
    expect(save).not.toHaveBeenCalled()
  })

  it('applies the two conditional permissions the way the gate does', async () => {
    // `moreskant` without a live Member unlocks nothing, so Ljestvica is
    // refused for the same account that could carry it with one.
    const dancerless = target({ permissions: ['moreskant'], ctx: { hasMember: false, hasPartner: false } })
    const refused = await handleSetTabs(
      '7',
      { tabs: ['leaderboard'] },
      deps({ loadTarget: async () => dancerless }),
    )
    expect(refused.status).toBe(400)

    const dancer = target({ permissions: ['moreskant'], ctx: { hasMember: true, hasPartner: false } })
    const ok = await handleSetTabs(
      '7',
      { tabs: ['leaderboard'] },
      deps({ loadTarget: async () => dancer }),
    )
    expect(ok.status).toBe(200)
  })

  it('refuses a fourth key (400) before it writes anything', async () => {
    const save = vi.fn(async () => {})
    const res = await handleSetTabs(
      '7',
      { tabs: ['orders', 'performances', 'inquiries', 'comp'] },
      deps({ save }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(S.tabs.tooMany(MAX_TABS))
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses a shared login as the caller, as all six routes do (403)', async () => {
    const res = await handleSetTabs(
      '7',
      { tabs: ['orders'] },
      deps({ caller: { id: '2', shared: true } }),
    )
    expect(res.status).toBe(403)
    expect(res.body.error).toBe(S.sharedCaller)
  })

  it('refuses a cross-site request (403)', async () => {
    const res = await handleSetTabs(
      '7',
      { tabs: ['orders'] },
      deps({ request: { ...SAME_SITE, secFetchSite: 'cross-site' } }),
    )
    expect(res.status).toBe(403)
    expect(res.body.error).toBe(S.rejected)
  })

  it('answers 404 for an id that is nobody, and for a read that threw', async () => {
    expect((await handleSetTabs('99', { tabs: [] }, deps({ loadTarget: async () => null }))).status).toBe(404)
    expect(
      (
        await handleSetTabs(
          '99',
          { tabs: [] },
          deps({
            loadTarget: async () => {
              throw new Error('db is down')
            },
          }),
        )
      ).status,
    ).toBe(404)
  })

  it('answers 500 when the write itself fails, and says so in Croatian', async () => {
    const res = await handleSetTabs(
      '7',
      { tabs: ['orders'] },
      deps({
        save: async () => {
          throw new Error('write failed')
        },
      }),
    )
    expect(res.status).toBe(500)
    expect(res.body.error).toBe(S.tabs.failed)
  })
})
