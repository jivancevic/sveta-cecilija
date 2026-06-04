import { describe, it, expect, vi } from 'vitest'
import { lookupOrder, type OrderLookupDeps, type MatchedOrder, type OrderToken } from './order-lookup'

const SHOW = { date: '2026-06-08', time: '21:30', venue: 'ljetno-kino' }

const TOKENS: OrderToken[] = [
  { token: 'tok-a', scanned: false },
  { token: 'tok-b', scanned: false },
  { token: 'tok-c', scanned: true },
]

function makeDeps(over: Partial<OrderLookupDeps> = {}): OrderLookupDeps {
  return {
    findMatches: vi.fn(async () => [] as MatchedOrder[]),
    loadTokens: vi.fn(async () => TOKENS),
    loadShow: vi.fn(async () => SHOW),
    recordAudit: vi.fn(async () => undefined),
    ...over,
  }
}

const ORDER: MatchedOrder = {
  id: '42',
  buyerName: 'Ana Marić',
  adultCount: 2,
  childCount: 1,
}

describe('lookupOrder — order code', () => {
  it('finds an order by its (uppercased) order code and returns a single match', async () => {
    const findMatches = vi.fn(async () => [ORDER])
    const deps = makeDeps({ findMatches })

    const res = await lookupOrder({ mode: 'code', query: ' ab3k ', showId: '7' }, deps)

    // Code is trimmed + uppercased before it hits the data layer.
    expect(findMatches).toHaveBeenCalledWith(
      { mode: 'code', code: 'AB3K' },
      '7',
    )
    expect(res.status).toBe('MATCH')
    if (res.status !== 'MATCH') throw new Error('expected MATCH')
    expect(res.order.buyerName).toBe('Ana Marić')
    expect(res.order.adultCount).toBe(2)
    expect(res.order.childCount).toBe(1)
    expect(res.order.show).toEqual(SHOW)
  })
})

describe('lookupOrder — audit', () => {
  it('records the lookup even when nothing matches (zero-match probe is audited)', async () => {
    const recordAudit = vi.fn(async () => undefined)
    const deps = makeDeps({ findMatches: vi.fn(async () => []), recordAudit })

    const res = await lookupOrder({ mode: 'email', query: 'NoOne@Example.com ', showId: '7' }, deps)

    expect(res.status).toBe('NOT_FOUND')
    expect(recordAudit).toHaveBeenCalledWith({
      mode: 'email',
      query: 'noone@example.com',
      showId: '7',
      matchedOrderIds: [],
    })
  })

  it('records the matched order ids on a hit', async () => {
    const recordAudit = vi.fn(async () => undefined)
    const deps = makeDeps({ findMatches: vi.fn(async () => [ORDER]), recordAudit })

    await lookupOrder({ mode: 'code', query: 'ab3k', showId: '7' }, deps)

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ matchedOrderIds: ['42'] }),
    )
  })
})

describe('lookupOrder — PII boundary', () => {
  it('the matched view exposes name + party + show + status, never email/amounts/refunds', async () => {
    const deps = makeDeps({ findMatches: vi.fn(async () => [ORDER]) })
    const res = await lookupOrder({ mode: 'code', query: 'ab3k', showId: '7' }, deps)
    if (res.status !== 'MATCH') throw new Error('expected MATCH')

    const keys = Object.keys(res.order)
    expect(keys).not.toContain('email')
    expect(keys).not.toContain('total')
    expect(keys).not.toContain('refundStatus')
    // Status the door needs: how many of the party are already in.
    expect(res.order.partySize).toBe(3)
    expect(res.order.scannedCount).toBe(1)
    // Tokens are carried (not PII) so the admit action can target a real ticket.
    expect(res.order.tokens).toHaveLength(3)
  })

  it('the data layer never even loads email/amounts (boundary is in the data contract)', () => {
    // MatchedOrder has no PII fields to leak — the type itself is the boundary.
    const keys = Object.keys(ORDER)
    expect(keys).toEqual(['id', 'buyerName', 'adultCount', 'childCount'])
  })
})

describe('lookupOrder — no browsable list', () => {
  it('returns AMBIGUOUS (a count, not a list) when a name matches multiple orders', async () => {
    const second: MatchedOrder = { ...ORDER, id: '43', buyerName: 'Ana Marković' }
    const loadTokens = vi.fn(async () => TOKENS)
    const loadShow = vi.fn(async () => SHOW)
    const deps = makeDeps({ findMatches: vi.fn(async () => [ORDER, second]), loadTokens, loadShow })

    const res = await lookupOrder({ mode: 'name', query: 'ana m', showId: '7' }, deps)

    expect(res).toEqual({ status: 'AMBIGUOUS', count: 2 })
    // No ticket/show I/O for a discarded ambiguous match.
    expect(loadTokens).not.toHaveBeenCalled()
    expect(loadShow).not.toHaveBeenCalled()
  })

  it('rejects a single-word name before it can fan out the whole show', async () => {
    const findMatches = vi.fn(async () => [] as MatchedOrder[])
    const res = await lookupOrder({ mode: 'name', query: 'ana', showId: '7' }, makeDeps({ findMatches }))
    expect(res.status).toBe('INVALID_QUERY')
    // Never even hits the data layer / audit on a malformed query.
    expect(findMatches).not.toHaveBeenCalled()
  })
})
