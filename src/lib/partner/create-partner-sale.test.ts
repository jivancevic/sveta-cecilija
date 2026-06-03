import { describe, it, expect, vi } from 'vitest'
import {
  createPartnerSale,
  PartnerSaleError,
  type PartnerSaleDeps,
  type PartnerSaleShow,
  type PersistTicket,
} from './create-partner-sale'
import type { IssuedOrder } from '../tickets/ticket-issuance'

type PersistArgs = { order: IssuedOrder; tickets: PersistTicket[] }

const SHOW: PartnerSaleShow = {
  id: 42,
  date: '2026-07-12',
  status: 'active',
  capacity: 320, // ljetno-kino
  inPersonSold: 0,
  legacyReserved: 0,
}

function deps(overrides: Partial<PartnerSaleDeps> = {}): PartnerSaleDeps {
  let n = 0
  return {
    loadShow: vi.fn(async () => SHOW),
    countActiveTickets: vi.fn(async () => 0),
    generateOrderCode: vi.fn(async () => 'AB23'),
    generateToken: vi.fn(() => `tok-${++n}`),
    persist: vi.fn(async () => ({ orderId: '1001' })),
    ...overrides,
  }
}

const base = { partnerId: 7, showId: 42, today: '2026-06-02', adults: 2, children: 1 }

describe('createPartnerSale — happy path', () => {
  it('issues one typed ticket per person with flat face value (no 5th-free) and a partner order', async () => {
    const d = deps()
    const res = await createPartnerSale(base, d)

    // 2 adults + 1 child = 3 tickets, one per person
    expect(res.tickets).toHaveLength(3)
    expect(res.tickets.map((t) => t.type)).toEqual(['adult', 'adult', 'child'])
    // CODE-N refs, adults first
    expect(res.tickets.map((t) => t.ref)).toEqual(['AB23-1', 'AB23-2', 'AB23-3'])
    expect(res.tickets.every((t) => t.token.startsWith('tok-'))).toBe(true)
    // flat face value: 2*20 + 1*10 = 50 EUR = 5000 cents (NO discount)
    expect(res.totalCents).toBe(5000)
    expect(res.code).toBe('AB23')
    expect(res.orderId).toBe('1001')
  })

  it('persists a partner-channel order with no PII / no Stripe, total = face value', async () => {
    const persist = vi.fn<(args: PersistArgs) => Promise<{ orderId: string }>>(
      async () => ({ orderId: '1001' }),
    )
    await createPartnerSale(base, deps({ persist }))
    const { order, tickets } = persist.mock.calls[0][0]
    expect(order.channel).toBe('partner')
    expect(order.partnerId).toBe(7)
    expect(order.buyerName).toBeNull()
    expect(order.email).toBeNull()
    expect(order.totalCents).toBe(5000)
    expect(tickets).toHaveLength(3)
    expect(tickets.every((t) => typeof t.token === 'string' && t.token.length > 0)).toBe(true)
  })

  it('flat face value applies even at 5+ tickets (online 5th-free must NOT apply)', async () => {
    const res = await createPartnerSale({ ...base, adults: 5, children: 0 }, deps())
    expect(res.totalCents).toBe(10000) // 5 * 20 EUR, no free ticket
    expect(res.tickets).toHaveLength(5)
  })
})

describe('createPartnerSale — oversell guard', () => {
  it('rejects a sale that would exceed remaining capacity', async () => {
    // capacity 320, already 318 active, 1 in-person, 1 legacy => remaining 0
    const d = deps({
      countActiveTickets: vi.fn(async () => 318),
      loadShow: vi.fn(async () => ({ ...SHOW, inPersonSold: 1, legacyReserved: 1 })),
    })
    await expect(createPartnerSale({ ...base, adults: 1, children: 0 }, d)).rejects.toMatchObject({
      code: 'OVERSELL',
    })
    expect((d.persist as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('allows a sale that exactly fills remaining capacity', async () => {
    const d = deps({ countActiveTickets: vi.fn(async () => 317) }) // remaining 3
    const res = await createPartnerSale(base, d) // requests 3
    expect(res.tickets).toHaveLength(3)
  })
})

describe('createPartnerSale — validation', () => {
  it.each([
    [{ adults: 0, children: 0 }, 'INVALID_QUANTITY'],
    [{ adults: -1, children: 0 }, 'INVALID_QUANTITY'],
    [{ adults: 1.5, children: 0 }, 'INVALID_QUANTITY'],
  ])('rejects %o', async (q, code) => {
    await expect(createPartnerSale({ ...base, ...q }, deps())).rejects.toMatchObject({ code })
  })

  it('rejects a missing show', async () => {
    await expect(
      createPartnerSale(base, deps({ loadShow: vi.fn(async () => null) })),
    ).rejects.toMatchObject({ code: 'SHOW_NOT_FOUND' })
  })

  it('rejects a cancelled show', async () => {
    await expect(
      createPartnerSale(base, deps({ loadShow: vi.fn(async () => ({ ...SHOW, status: 'cancelled' as const })) })),
    ).rejects.toMatchObject({ code: 'SHOW_INACTIVE' })
  })

  it('rejects a past show but allows a show on today', async () => {
    await expect(
      createPartnerSale({ ...base, today: '2026-07-13' }, deps()), // show is 2026-07-12
    ).rejects.toMatchObject({ code: 'SHOW_PAST' })
    // same-day still sellable
    const res = await createPartnerSale({ ...base, today: '2026-07-12' }, deps())
    expect(res.tickets).toHaveLength(3)
  })

  it('PartnerSaleError carries a machine-readable code', async () => {
    const err = await createPartnerSale({ ...base, adults: 0, children: 0 }, deps()).catch((e) => e)
    expect(err).toBeInstanceOf(PartnerSaleError)
    expect(err.code).toBe('INVALID_QUANTITY')
  })
})

describe('createPartnerSale — seat lock serialization (#179)', () => {
  it('runs the count→capacity-check→persist inside withSeatLock, keyed on the show id', async () => {
    const events: string[] = []
    const withSeatLock = vi.fn(async <T,>(showId: number, critical: () => Promise<T>) => {
      events.push(`lock:${showId}`)
      const r = await critical()
      events.push('unlock')
      return r
    })
    const d = deps({
      countActiveTickets: vi.fn(async () => {
        events.push('count')
        return 0
      }),
      persist: vi.fn(async () => {
        events.push('persist')
        return { orderId: '1001' }
      }),
      withSeatLock: withSeatLock as unknown as <T>(
        showId: number,
        critical: () => Promise<T>,
      ) => Promise<T>,
    })

    await createPartnerSale(base, d)

    expect(withSeatLock).toHaveBeenCalledWith(42, expect.any(Function))
    // Count and persist happen strictly between acquiring and releasing the lock.
    expect(events).toEqual(['lock:42', 'count', 'persist', 'unlock'])
  })

  it('does not persist when the lock-wrapped guard rejects (oversell)', async () => {
    const persist = vi.fn(async () => ({ orderId: '1001' }))
    const d = deps({
      countActiveTickets: vi.fn(async () => 320), // full → assertCanSell throws
      persist,
      withSeatLock: async (_id, critical) => critical(),
    })
    await expect(createPartnerSale(base, d)).rejects.toMatchObject({ code: 'OVERSELL' })
    expect(persist).not.toHaveBeenCalled()
  })
})
