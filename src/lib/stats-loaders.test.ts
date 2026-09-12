import { describe, expect, it, vi } from 'vitest'
import { loadShowStatsInput, loadStatsInput } from './stats-loaders'
import type { ShowsFindArgs } from './show-loaders'

// Same in-memory stand-in for `payload.find({ collection: 'shows' })` as
// show-loaders.test.ts: it genuinely EVALUATES the `where` it is handed, so a
// loader that forgets the public-performance predicate hands back the non-public
// rows and the test fails on behaviour (which rows come back), not on how the
// Where happens to be spelled.
type Row = Record<string, unknown>

function matches(row: Row, where: Record<string, unknown>): boolean {
  if (Array.isArray(where.and)) {
    return (where.and as Record<string, unknown>[]).every((w) => matches(row, w))
  }
  return Object.entries(where).every(([field, cond]) => {
    const c = cond as Record<string, unknown>
    const value = row[field]
    if ('equals' in c) return value === c.equals
    throw new Error(`fake find: unsupported operator in ${JSON.stringify(c)}`)
  })
}

function fakeFind(rows: Row[]) {
  return async (args: ShowsFindArgs) => {
    const docs = rows
      .filter((r) => matches(r, (args.where ?? {}) as Record<string, unknown>))
      .sort((a, b) => new Date(String(a.date)).getTime() - new Date(String(b.date)).getTime())
      .slice(0, args.limit ?? rows.length)
    return { docs }
  }
}

const publicShow: Row = {
  id: 1,
  date: '2026-08-10T12:00:00.000Z',
  time: '21:00',
  venue: 'ljetno-kino',
  status: 'active',
  isPublic: true,
  kind: 'redovna',
  inPersonSold: 4,
  legacyReserved: 2,
}

// A cruise-ship call: no venue, no capacity, no sales. It must never reach a
// statistics surface as a zero-capacity, sold-out row.
const nonPublicPerformance: Row = {
  id: 2,
  date: '2026-08-09T10:00:00.000Z',
  time: '10:00',
  venue: null,
  status: 'active',
  isPublic: false,
  kind: 'dmc',
  location: 'Zimsko kino',
  client: 'Le Ponant',
  inPersonSold: 0,
  legacyReserved: 0,
}

const noExtraReads = {
  soldByShow: async () => new Map<string, number>(),
  scannedByShow: async () => new Map<string, number>(),
  totalRevenueCents: async () => 0,
}

describe('loadStatsInput', () => {
  it('returns public performances only from a mixed set', async () => {
    const input = await loadStatsInput({
      find: fakeFind([nonPublicPerformance, publicShow]),
      ...noExtraReads,
    })
    expect(input.shows.map((s) => s.id)).toEqual(['1'])
  })

  it('shapes a public row with its live ticket counts', async () => {
    const input = await loadStatsInput({
      find: fakeFind([nonPublicPerformance, publicShow]),
      soldByShow: async () => new Map([['1', 30], ['2', 99]]),
      scannedByShow: async () => new Map([['1', 12], ['2', 99]]),
      totalRevenueCents: async () => 123456,
      today: new Date('2026-08-01T00:00:00.000Z'),
    })
    expect(input.totalRevenueCents).toBe(123456)
    expect(input.today).toEqual(new Date('2026-08-01T00:00:00.000Z'))
    expect(input.shows).toEqual([
      {
        id: '1',
        date: '2026-08-10',
        time: '21:00',
        venue: 'ljetno-kino',
        activeTicketCount: 30,
        inPersonSold: 4,
        legacyReserved: 2,
        scannedCount: 12,
        status: 'active',
      },
    ])
  })

  it('keeps cancelled public shows (statistics report them, the buyer path does not)', async () => {
    const input = await loadStatsInput({
      find: fakeFind([{ ...publicShow, status: 'cancelled' }]),
      ...noExtraReads,
    })
    expect(input.shows.map((s) => s.status)).toEqual(['cancelled'])
  })
})

describe('loadShowStatsInput', () => {
  const deps = (row: Row | null) => ({
    findByID: async () => row,
    ordersForShow: async () => [
      {
        id: 10,
        buyer_name: 'Ana',
        email: 'ana@example.com',
        adult_count: 2,
        child_count: 0,
        total: 4000,
        refund_status: 'none',
        channel: 'online',
      },
    ],
    ticketsForOrders: async () => [
      { order_id: 10, token: 't1', scanned: false, scanned_at: null },
      { order_id: 10, token: 't2', scanned: true, scanned_at: '2026-08-10T19:00:00.000Z' },
    ],
  })

  it('returns not-found for a non-public performance id', async () => {
    const ordersForShow = vi.fn(deps(nonPublicPerformance).ordersForShow)
    const input = await loadShowStatsInput(
      { ...deps(nonPublicPerformance), ordersForShow },
      '2',
    )
    expect(input).toBeNull()
    // The non-public row is rejected before any order/ticket read happens.
    expect(ordersForShow).not.toHaveBeenCalled()
  })

  it('returns not-found for a non-numeric or missing id', async () => {
    expect(await loadShowStatsInput(deps(publicShow), 'nope')).toBeNull()
    expect(await loadShowStatsInput(deps(null), '1')).toBeNull()
  })

  it('returns the show with its orders and tickets for a public id', async () => {
    const input = await loadShowStatsInput(deps(publicShow), '1')
    expect(input).not.toBeNull()
    expect(input!.show).toMatchObject({
      id: '1',
      date: '2026-08-10',
      time: '21:00',
      venue: 'ljetno-kino',
      activeTicketCount: 2,
      inPersonSold: 4,
      legacyReserved: 2,
      status: 'active',
    })
    expect(input!.orders).toEqual([
      {
        id: '10',
        buyerName: 'Ana',
        email: 'ana@example.com',
        adultCount: 2,
        childCount: 0,
        totalCents: 4000,
        refunded: false,
        channel: 'online',
        tokens: [
          { token: 't1', scanned: false, scannedAt: null },
          { token: 't2', scanned: true, scannedAt: '2026-08-10T19:00:00.000Z' },
        ],
      },
    ])
  })
})
