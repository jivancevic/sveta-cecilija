import { describe, it, expect, vi } from 'vitest'
import {
  createCompIssue,
  CompIssueError,
  type CompIssueDeps,
  type CompIssueShow,
  type PersistTicket,
} from './create-comp-issue'
import type { IssuedOrder } from '../tickets/ticket-issuance'

type PersistArgs = { order: IssuedOrder; tickets: PersistTicket[] }

const SHOW: CompIssueShow = {
  id: 42,
  date: '2026-07-12',
  status: 'active',
  capacity: 320, // ljetno-kino
  inPersonSold: 0,
  legacyReserved: 0,
}

function deps(overrides: Partial<CompIssueDeps> = {}): CompIssueDeps {
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

const base = { memberId: 5, showId: 42, today: '2026-06-02', adults: 2, children: 1 }

describe('createCompIssue — happy path', () => {
  it('issues one typed ticket per person at total=0, comp channel, member attribution', async () => {
    const res = await createCompIssue(base, deps())
    expect(res.tickets).toHaveLength(3)
    expect(res.tickets.map((t) => t.type)).toEqual(['adult', 'adult', 'child'])
    expect(res.tickets.map((t) => t.ref)).toEqual(['AB23-1', 'AB23-2', 'AB23-3'])
    expect(res.code).toBe('AB23')
    expect(res.orderId).toBe('1001')
  })

  it('persists a comp-channel order with total=0 and the member id', async () => {
    const persist = vi.fn<(args: PersistArgs) => Promise<{ orderId: string }>>(
      async () => ({ orderId: '1001' }),
    )
    await createCompIssue(base, deps({ persist }))
    const { order, tickets } = persist.mock.calls[0][0]
    expect(order.channel).toBe('comp')
    expect(order.memberId).toBe(5)
    expect(order.partnerId).toBeNull()
    expect(order.totalCents).toBe(0)
    expect(tickets).toHaveLength(3)
  })

  it('stays free even at 5+ tickets (no face value, no 5th-free math)', async () => {
    const persist = vi.fn<(args: PersistArgs) => Promise<{ orderId: string }>>(
      async () => ({ orderId: '1001' }),
    )
    await createCompIssue({ ...base, adults: 5, children: 0 }, deps({ persist }))
    expect(persist.mock.calls[0][0].order.totalCents).toBe(0)
  })

  it('defaults the printed holder to the passed name, trims and nulls blanks', async () => {
    const persist = vi.fn<(args: PersistArgs) => Promise<{ orderId: string }>>(
      async () => ({ orderId: '1001' }),
    )
    await createCompIssue({ ...base, buyerName: '  Ana Marić  ', email: '  a@b.com ' }, deps({ persist }))
    expect(persist.mock.calls[0][0].order.buyerName).toBe('Ana Marić')
    expect(persist.mock.calls[0][0].order.email).toBe('a@b.com')

    const persist2 = vi.fn<(args: PersistArgs) => Promise<{ orderId: string }>>(
      async () => ({ orderId: '1002' }),
    )
    await createCompIssue({ ...base, buyerName: '   ', email: '' }, deps({ persist: persist2 }))
    expect(persist2.mock.calls[0][0].order.buyerName).toBeNull()
    expect(persist2.mock.calls[0][0].order.email).toBeNull()
  })
})

describe('createCompIssue — member required', () => {
  it.each([[0], [-1], [1.5], [NaN]])('rejects a non-positive-integer member (%s)', async (memberId) => {
    await expect(createCompIssue({ ...base, memberId }, deps())).rejects.toMatchObject({
      code: 'MEMBER_REQUIRED',
    })
  })

  it('does not persist when the member is missing', async () => {
    const persist = vi.fn(async () => ({ orderId: '1001' }))
    await expect(createCompIssue({ ...base, memberId: 0 }, deps({ persist }))).rejects.toBeInstanceOf(
      CompIssueError,
    )
    expect(persist).not.toHaveBeenCalled()
  })
})

describe('createCompIssue — validation + oversell', () => {
  it.each([
    [{ adults: 0, children: 0 }, 'INVALID_QUANTITY'],
    [{ adults: -1, children: 0 }, 'INVALID_QUANTITY'],
    [{ adults: 1.5, children: 0 }, 'INVALID_QUANTITY'],
  ])('rejects %o', async (q, code) => {
    await expect(createCompIssue({ ...base, ...q }, deps())).rejects.toMatchObject({ code })
  })

  it('rejects a comp that would exceed remaining capacity (comps consume seats)', async () => {
    const d = deps({
      countActiveTickets: vi.fn(async () => 318),
      loadShow: vi.fn(async () => ({ ...SHOW, inPersonSold: 1, legacyReserved: 1 })),
    })
    await expect(createCompIssue({ ...base, adults: 1, children: 0 }, d)).rejects.toMatchObject({
      code: 'OVERSELL',
    })
    expect(d.persist as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it('rejects a missing / cancelled / past show', async () => {
    await expect(
      createCompIssue(base, deps({ loadShow: vi.fn(async () => null) })),
    ).rejects.toMatchObject({ code: 'SHOW_NOT_FOUND' })
    await expect(
      createCompIssue(base, deps({ loadShow: vi.fn(async () => ({ ...SHOW, status: 'cancelled' as const })) })),
    ).rejects.toMatchObject({ code: 'SHOW_INACTIVE' })
    await expect(
      createCompIssue({ ...base, today: '2026-07-13' }, deps()),
    ).rejects.toMatchObject({ code: 'SHOW_PAST' })
  })
})

describe('createCompIssue — seat lock serialization (#179)', () => {
  it('runs count→check→persist inside withSeatLock keyed on the show id', async () => {
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

    await createCompIssue(base, d)

    expect(withSeatLock).toHaveBeenCalledWith(42, expect.any(Function))
    expect(events).toEqual(['lock:42', 'count', 'persist', 'unlock'])
  })
})
