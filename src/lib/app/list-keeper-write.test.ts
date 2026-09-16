import { describe, expect, it, vi } from 'vitest'
import { handleListKeeperWrite, type ListKeeperDeps } from './list-keeper-write'
import { APP_STRINGS } from './strings'
import type { AppRequestMeta } from './request-guard'

const sameSite: AppRequestMeta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}
const crossSite: AppRequestMeta = { ...sameSite, secFetchSite: 'cross-site' }

const ANTE = { id: '7', active: true, isMoreskant: true }

function deps(over: Partial<ListKeeperDeps> = {}) {
  const save = vi.fn().mockResolvedValue(undefined)
  const send = vi.fn().mockResolvedValue({ recipients: 1, devices: 1 })
  return {
    save,
    send,
    all: {
      request: sameSite,
      loadPerformance: async (id: string) =>
        id === '10'
          ? { id: '10', date: '2026-08-20', time: '21:00', listKeepers: [] as unknown[] }
          : null,
      loadMember: async (id: string) => (id === '7' ? ANTE : null),
      save,
      loadUserIdsByMember: async () => ['u7'],
      send,
      ...over,
    } as ListKeeperDeps,
  }
}

describe('handleListKeeperWrite — naming somebody', () => {
  it('stores the member and answers with the set', async () => {
    const { all, save } = deps()
    const result = await handleListKeeperWrite('10', { memberId: '7', keeps: true }, all)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, keepers: ['7'] })
    expect(save).toHaveBeenCalledWith('10', ['7'])
  })

  it('adds to the people already named rather than replacing them', async () => {
    const { all, save } = deps({
      loadPerformance: async () => ({
        id: '10',
        date: '2026-08-20',
        time: '21:00',
        listKeepers: [3],
      }),
    })
    await handleListKeeperWrite('10', { memberId: '7', keeps: true }, all)
    expect(save).toHaveBeenCalledWith('10', ['3', '7'])
  })

  it('rings the new keeper’s phone once, deep-linked to Stanje', async () => {
    const { all, send } = deps()
    await handleListKeeperWrite('10', { memberId: '7', keeps: true }, all)
    expect(send).toHaveBeenCalledWith(
      ['u7'],
      expect.objectContaining({ kind: 'list_keeper', url: '/app/moreska/10' }),
    )
  })

  it('writes nothing and rings nothing when they are already named', async () => {
    const { all, save, send } = deps({
      loadPerformance: async () => ({
        id: '10',
        date: '2026-08-20',
        time: '21:00',
        listKeepers: ['7'],
      }),
    })
    const result = await handleListKeeperWrite('10', { memberId: '7', keeps: true }, all)
    expect(result.status).toBe(200)
    expect(save).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('says nothing to a dancer with no login, and still names them', async () => {
    const { all, save, send } = deps({ loadUserIdsByMember: async () => [] })
    const result = await handleListKeeperWrite('10', { memberId: '7', keeps: true }, all)
    expect(result.status).toBe(200)
    expect(save).toHaveBeenCalledWith('10', ['7'])
    expect(send).not.toHaveBeenCalled()
  })

  it('names them even when the push throws: being named is the fact', async () => {
    const { all, save } = deps({
      send: vi.fn().mockRejectedValue(new Error('push service down')),
    })
    const result = await handleListKeeperWrite('10', { memberId: '7', keeps: true }, all)
    expect(result.status).toBe(200)
    expect(save).toHaveBeenCalled()
  })

  it.each([
    ['a retired member', { id: '7', active: false, isMoreskant: true }],
    ['somebody who is not a moreškant', { id: '7', active: true, isMoreskant: false }],
    ['a member who does not exist', null],
  ])('400s %s and writes nothing', async (_label, member) => {
    const { all, save } = deps({ loadMember: async () => member })
    const result = await handleListKeeperWrite('10', { memberId: '7', keeps: true }, all)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.listKeepers.notMoreskant })
    expect(save).not.toHaveBeenCalled()
  })
})

describe('handleListKeeperWrite — taking it back', () => {
  it('removes the member and leaves the others', async () => {
    const { all, save, send } = deps({
      loadPerformance: async () => ({
        id: '10',
        date: '2026-08-20',
        time: '21:00',
        listKeepers: [3, 7],
      }),
    })
    const result = await handleListKeeperWrite('10', { memberId: '7', keeps: false }, all)
    expect(result.body).toEqual({ ok: true, keepers: ['3'] })
    expect(save).toHaveBeenCalledWith('10', ['3'])
    // Nothing on removal (Q13): a phone that buzzes to say something was taken
    // away asks a question nobody can act on.
    expect(send).not.toHaveBeenCalled()
  })

  it('is harmless on somebody who was never named', async () => {
    const { all, save } = deps()
    const result = await handleListKeeperWrite('10', { memberId: '7', keeps: false }, all)
    expect(result.status).toBe(200)
    expect(save).not.toHaveBeenCalled()
  })

  it('removes a member who has since left the roster', async () => {
    const { all, save } = deps({
      loadPerformance: async () => ({
        id: '10',
        date: '2026-08-20',
        time: '21:00',
        listKeepers: ['7'],
      }),
      loadMember: async () => ({ id: '7', active: false, isMoreskant: true }),
    })
    const result = await handleListKeeperWrite('10', { memberId: '7', keeps: false }, all)
    expect(result.status).toBe(200)
    expect(save).toHaveBeenCalledWith('10', [])
  })
})

describe('handleListKeeperWrite — the refusals', () => {
  it('refuses a cross-site POST before it reads anything', async () => {
    const { all, save } = deps({ request: crossSite })
    const result = await handleListKeeperWrite('10', { memberId: '7', keeps: true }, all)
    expect(result.status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it.each([
    ['no member', { keeps: true }],
    ['no verb', { memberId: '7' }],
    ['a verb that is not a boolean', { memberId: '7', keeps: 'yes' }],
  ])('400s a body with %s', async (_label, body) => {
    const { all } = deps()
    const result = await handleListKeeperWrite('10', body, all)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.listKeepers.badRequest })
  })

  it('400s an unknown evening', async () => {
    const { all } = deps()
    const result = await handleListKeeperWrite('99', { memberId: '7', keeps: true }, all)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.listKeepers.noPerformance })
  })
})
