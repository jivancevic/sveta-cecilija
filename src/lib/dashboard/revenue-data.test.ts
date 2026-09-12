import { describe, expect, it, vi } from 'vitest'
import { getDashboardMoney } from './revenue-data'
import { publicPerformanceSql } from '../show-performance'

// The three reads of getDashboardMoney are plain SQL, so the fake pool here
// answers by matching on the statement rather than by evaluating it.
//
// The offline-sales read is the one #406 gates: a non-public performance has no
// venue, no capacity and no door, so its lines must never enter the season money
// figure — and, more to the point, the query must not be able to pick one up if a
// stray row ever survives against such a performance. Since ADR-0025 the read
// joins `shows` and scopes on the alias, so the assertion is on the aliased form.
function fakePool(rows: {
  orders: Record<string, unknown>[]
  offlineLines: Record<string, unknown>[]
}) {
  const seen: string[] = []
  const query = vi.fn(async (sql: string) => {
    seen.push(sql)
    if (/FROM offline_sales/i.test(sql)) {
      // Only answer with lines when the statement is scoped to public
      // performances; otherwise the caller is reading every row in the table.
      const scoped = sql.includes(publicPerformanceSql('s'))
      return { rows: scoped ? rows.offlineLines : [] }
    }
    if (/FROM orders/i.test(sql)) return { rows: rows.orders }
    return { rows: [] }
  })
  return { query, seen }
}

function line(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    show_id: 1,
    source: 'door',
    ticket_type: 'adult',
    quantity: 1,
    unit_price_cents: 2000,
    discount_label: null,
    note: null,
    created_at: '2026-09-12T10:00:00.000Z',
    ...over,
  }
}

describe('getDashboardMoney', () => {
  it('sums the offline ledger over public performances only', async () => {
    const { query, seen } = fakePool({
      orders: [{ total: 4000, refund_status: 'none' }],
      offlineLines: [line({ id: 1, quantity: 3 })],
    })

    const money = await getDashboardMoney(query)

    const offlineSql = seen.find((s) => /FROM offline_sales/i.test(s))!
    expect(offlineSql).toContain(publicPerformanceSql('s'))
    // 4000 cents of orders + 3 door adults at €20 = 4000 + 6000.
    expect(money.revenueCollectedCents).toBe(4000 + 6000)
  })

  it('prices each line at what was actually charged, mixing types and discounts', async () => {
    // The 2026 shape: full-price adults, children at €10, and a pensioner group
    // at €15 that stays an ADULT line carrying a discount label (ADR-0025).
    const { query } = fakePool({
      orders: [],
      offlineLines: [
        line({ id: 1, ticket_type: 'adult', quantity: 68, unit_price_cents: 2000 }),
        line({ id: 2, ticket_type: 'child', quantity: 5, unit_price_cents: 1000 }),
        line({
          id: 3,
          ticket_type: 'adult',
          quantity: 32,
          unit_price_cents: 1500,
          discount_label: 'umirovljenici (grupni popust)',
        }),
      ],
    })

    const money = await getDashboardMoney(query)
    // 68×2000 + 5×1000 + 32×1500 = 136000 + 5000 + 48000
    expect(money.revenueCollectedCents).toBe(189000)
  })

  it('counts legacy lines as collected cash alongside door lines', async () => {
    const { query } = fakePool({
      orders: [],
      offlineLines: [
        line({ id: 1, source: 'door', quantity: 10, unit_price_cents: 2000 }),
        line({ id: 2, source: 'legacy', quantity: 5, unit_price_cents: 2000 }),
      ],
    })

    const money = await getDashboardMoney(query)
    expect(money.revenueCollectedCents).toBe(30000)
  })

  it('lets a negative correction line reduce collected revenue', async () => {
    const { query } = fakePool({
      orders: [],
      offlineLines: [
        line({ id: 1, quantity: 68, unit_price_cents: 2000 }),
        line({ id: 2, quantity: -20, unit_price_cents: 2000 }),
      ],
    })

    const money = await getDashboardMoney(query)
    expect(money.revenueCollectedCents).toBe(48 * 2000)
  })

  it('drops fully refunded orders and reports the partner receivable apart', async () => {
    const { query } = fakePool({
      orders: [
        { total: 4000, refund_status: 'none' },
        { total: 2000, refund_status: 'refunded' },
      ],
      offlineLines: [],
    })

    const money = await getDashboardMoney(query)
    expect(money.revenueCollectedCents).toBe(4000)
    expect(money.partnerReceivableCents).toBe(0)
  })
})
