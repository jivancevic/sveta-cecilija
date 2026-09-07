import { describe, expect, it, vi } from 'vitest'
import { getDashboardMoney } from './revenue-data'
import { publicPerformanceSql } from '../show-performance'

// The three reads of getDashboardMoney are plain SQL, so the fake pool here
// answers by matching on the statement rather than by evaluating it. The
// in-person read is the one #406 gates: a non-public performance has no
// capacity and no box-office sales, so its (always 0) counter must never enter
// the season money figure — and, more to the point, the query must not be able
// to pick one up if a stray counter ever survives on such a row.
function fakePool(rows: { orders: Record<string, unknown>[]; inPersonCount: number }) {
  const seen: string[] = []
  const query = vi.fn(async (sql: string) => {
    seen.push(sql)
    if (/FROM orders/i.test(sql)) return { rows: rows.orders }
    if (/FROM shows/i.test(sql)) {
      // Only answer with a count when the statement is scoped to public
      // performances; otherwise the caller is reading every row in the table.
      const scoped = sql.includes(publicPerformanceSql())
      return { rows: [{ count: scoped ? String(rows.inPersonCount) : '999' }] }
    }
    return { rows: [] }
  })
  return { query, seen }
}

describe('getDashboardMoney', () => {
  it('sums in-person sales over public performances only', async () => {
    const { query, seen } = fakePool({
      orders: [{ total: 4000, refund_status: 'none' }],
      inPersonCount: 3,
    })

    const money = await getDashboardMoney(query)

    const showsSql = seen.find((s) => /FROM shows/i.test(s))!
    expect(showsSql).toContain(publicPerformanceSql())
    // 4000 cents of orders + 3 door adults at €20 = 4000 + 6000.
    expect(money.revenueCollectedCents).toBe(4000 + 3 * 2000)
  })

  it('drops fully refunded orders and reports the partner receivable apart', async () => {
    const { query } = fakePool({
      orders: [
        { total: 4000, refund_status: 'none' },
        { total: 2000, refund_status: 'refunded' },
      ],
      inPersonCount: 0,
    })

    const money = await getDashboardMoney(query)
    expect(money.revenueCollectedCents).toBe(4000)
    expect(money.partnerReceivableCents).toBe(0)
  })
})
