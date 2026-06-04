import { describe, it, expect, vi } from 'vitest'
import { computeMonthToDate, getPartnerMonthToDate } from './month-to-date'
import type { ReconTicketRow } from './partner-reconciliation'

function row(over: Partial<ReconTicketRow> = {}): ReconTicketRow {
  return {
    showId: '1',
    showLabel: '2026-07-12 · Ljetno kino',
    type: 'adult',
    status: 'active',
    orderCreatedAt: '2026-07-01T10:00:00.000Z',
    ...over,
  }
}

describe('computeMonthToDate — partner-perspective owed / commission math', () => {
  it('frames net as owed to HGD, commission as the partner cut, net of cancelled', () => {
    // 3 adults (€20) + 2 children (€10) = €80.00 = 8000 cents gross.
    const rows = [
      row({ type: 'adult' }),
      row({ type: 'adult' }),
      row({ type: 'adult' }),
      row({ type: 'child' }),
      row({ type: 'child' }),
    ]
    const mtd = computeMonthToDate(rows, { commissionPercent: 10 })
    expect(mtd.ticketsSold).toBe(5)
    expect(mtd.grossCents).toBe(8000)
    expect(mtd.commissionCents).toBe(800) // your commission = 10% of gross
    expect(mtd.owedCents).toBe(7200) // you owe HGD = gross − commission
    // owe + commission always reconciles to gross face value.
    expect(mtd.owedCents + mtd.commissionCents).toBe(mtd.grossCents)
  })

  it('excludes cancelled tickets from the sold/owed/commission figures', () => {
    const rows = [
      row({ type: 'adult', status: 'active' }), // billable 2000
      row({ type: 'adult', status: 'cancelled', cancelReason: 'storno' }),
      row({ type: 'child', status: 'cancelled', cancelReason: 'refund' }),
    ]
    const mtd = computeMonthToDate(rows, { commissionPercent: 10 })
    expect(mtd.ticketsSold).toBe(1) // net of cancelled
    expect(mtd.grossCents).toBe(2000)
    expect(mtd.commissionCents).toBe(200)
    expect(mtd.owedCents).toBe(1800)
    expect(mtd.cancelledCount).toBe(2)
  })

  it('uses the partner OWN commission rate', () => {
    const rows = [row({ type: 'adult' })] // €20 = 2000 cents
    expect(computeMonthToDate(rows, { commissionPercent: 10 }).commissionCents).toBe(200)
    expect(computeMonthToDate(rows, { commissionPercent: 25 }).commissionCents).toBe(500)
    expect(computeMonthToDate(rows, { commissionPercent: 25 }).owedCents).toBe(1500)
  })

  it('is all-zero for an empty month', () => {
    const mtd = computeMonthToDate([], { commissionPercent: 10 })
    expect(mtd).toMatchObject({
      ticketsSold: 0,
      grossCents: 0,
      commissionCents: 0,
      owedCents: 0,
      cancelledCount: 0,
    })
  })
})

describe('getPartnerMonthToDate — scoped query + injected month window', () => {
  function dbRows(rs: Record<string, unknown>[]) {
    return { rows: rs }
  }

  it('scopes the SQL to the partner id and the injected (year, month) only', async () => {
    const query = vi.fn().mockResolvedValue(dbRows([]))
    await getPartnerMonthToDate(query, {
      partnerId: 7,
      commissionPercent: 10,
      year: 2026,
      month: 6,
    })
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('o.partner_id = $1')
    expect(params).toEqual([7, 2026, 6])
  })

  it('never returns partner B rows when scoped to partner A (no cross-partner leakage)', async () => {
    // Simulate the DB honouring the WHERE clause: a query for partner 7 only
    // ever sees partner 7's rows. Partner 99's rows must not contaminate the math.
    const partnerARows = [
      { show_id: 1, show_date: '2026-06-12', show_venue: 'ljetno-kino', type: 'adult', status: 'active', cancel_reason: null, order_created_at: '2026-06-01T10:00:00.000Z' },
    ]
    const query = vi.fn(async (_sql: string, params?: unknown[]) => {
      expect(params?.[0]).toBe(7) // scoped to A only
      return dbRows(partnerARows)
    })
    const mtd = await getPartnerMonthToDate(query, {
      partnerId: 7,
      commissionPercent: 10,
      year: 2026,
      month: 6,
    })
    // Only the single partner-A adult (€20) is counted; B never reaches the math.
    expect(mtd.ticketsSold).toBe(1)
    expect(mtd.grossCents).toBe(2000)
    expect(mtd.owedCents).toBe(1800)
  })

  it('returns an all-zero card without querying for a non-numeric partner id', async () => {
    const query = vi.fn()
    const mtd = await getPartnerMonthToDate(query, {
      partnerId: Number('not-a-number'),
      commissionPercent: 10,
      year: 2026,
      month: 6,
    })
    expect(query).not.toHaveBeenCalled()
    expect(mtd.ticketsSold).toBe(0)
    expect(mtd.owedCents).toBe(0)
  })
})
