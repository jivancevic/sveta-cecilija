import { describe, expect, it, vi } from 'vitest'
import { loadSeasonSales } from './sales-data'
import { publicPerformanceSql } from '@/lib/show-performance'

// The seam is stubbed at the module rather than through `setRepoForTests`,
// because importing `@/lib/repo` for real would pull `@payload-config` — and
// with it a Payload instance — into a unit test that only needs a pool.
const seam = vi.hoisted(() => ({
  query: (async () => ({ rows: [] })) as (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>,
}))

vi.mock('@/lib/repo', () => ({
  getRepo: () => ({ db: { query: (sql: string, params?: unknown[]) => seam.query(sql, params) } }),
}))

// The wiring half of Izvedbe's sales numbers (#502), and the money rule #538
// fixed in it.
//
// `loadSeasonSales` is six plain SQL reads behind `getRepo().db.query`, so the
// fake pool here answers by matching on the statement rather than evaluating
// it, exactly as `dashboard/revenue-data.test.ts` does for the season band.
// What is asserted is the number the screen ends up with, never the shape of a
// query, with one exception: the channel clause on the money read is asserted
// directly, because it is the fix.

interface Rows {
  shows?: Record<string, unknown>[]
  orders?: Record<string, unknown>[]
  partnerTickets?: Record<string, unknown>[]
  channelCounts?: Record<string, unknown>[]
}

function fakeRepo(rows: Rows) {
  const seen: string[] = []
  const query = vi.fn(async (sql: string) => {
    seen.push(sql)
    if (/FROM offline_sales/i.test(sql)) return { rows: [] }
    if (/FROM shows s/i.test(sql) && /s\.venue/.test(sql)) return { rows: rows.shows ?? [] }
    // The money read: orders alone, one row per order.
    if (/FROM orders o/i.test(sql)) return { rows: rows.orders ?? [] }
    // The partner split: the only tickets read that asks for `t.type`.
    if (/t\.type/i.test(sql)) return { rows: rows.partnerTickets ?? [] }
    if (/t\.scanned = true/i.test(sql)) return { rows: [] }
    if (/FROM tickets t/i.test(sql)) return { rows: rows.channelCounts ?? [] }
    return { rows: [] }
  })
  seam.query = query
  return { query, seen }
}

const SHOW = { id: 1, venue: 'ljetno-kino', status: 'active', online_sales_paused: false }

describe('one evening’s money', () => {
  it('counts online orders net of refunds and leaves partner face value out', async () => {
    const { seen } = fakeRepo({
      shows: [SHOW],
      orders: [
        { show_id: 1, channel: 'online', total: 4000, refund_status: 'none' },
        // Refunded: the money went back out.
        { show_id: 1, channel: 'online', total: 2000, refund_status: 'refunded' },
        // Face value the reseller holds until the obračun (ADR-0008).
        { show_id: 1, channel: 'partner', total: 6000, refund_status: 'none' },
        // A storno: the tickets are void, the order row is untouched, so only
        // the channel clause can take it out.
        { show_id: 1, channel: 'partner', total: 4000, refund_status: 'none' },
        // Goodwill: €0 (ADR-0019).
        { show_id: 1, channel: 'comp', total: 0, refund_status: 'none' },
      ],
    })

    const sales = await loadSeasonSales()
    expect(sales.get('1')?.ticketRevenueCents).toBe(4000)

    const moneySql = seen.find((s) => /FROM orders o/i.test(s))!
    expect(moneySql).toMatch(/channel\s*=\s*'online'/)
    // The money read never joins tickets: that would multiply each total by the
    // party size.
    expect(moneySql).not.toMatch(/JOIN tickets/i)
    expect(moneySql).toContain(publicPerformanceSql('s'))
  })

  it('reads the partner seats apart, split by type, so they can be priced', async () => {
    fakeRepo({
      shows: [SHOW],
      partnerTickets: [
        { show_id: 1, type: 'adult', seats: 10 },
        { show_id: 1, type: 'child', seats: 2 },
      ],
    })

    const sales = await loadSeasonSales()
    expect(sales.get('1')?.partnerAdult).toBe(10)
    expect(sales.get('1')?.partnerChild).toBe(2)
  })

  it('leaves an evening with no partner sales at a zero split', async () => {
    fakeRepo({ shows: [SHOW] })

    const sales = await loadSeasonSales()
    expect(sales.get('1')?.partnerAdult).toBe(0)
    expect(sales.get('1')?.partnerChild).toBe(0)
    expect(sales.get('1')?.ticketRevenueCents).toBe(0)
  })
})
