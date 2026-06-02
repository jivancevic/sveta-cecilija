import { describe, it, expect } from 'vitest'
import {
  buildReconciliationStatement,
  monthKeyInZagreb,
  centsToEur,
  type ReconTicketRow,
} from './partner-reconciliation'

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

describe('buildReconciliationStatement — gross / commission / net math', () => {
  it('computes gross from face value, commission rounded, net = gross − commission', () => {
    // 3 adults (€20) + 2 children (€10) = €80.00 = 8000 cents
    const rows = [
      row({ type: 'adult' }),
      row({ type: 'adult' }),
      row({ type: 'adult' }),
      row({ type: 'child' }),
      row({ type: 'child' }),
    ]
    const s = buildReconciliationStatement({
      partnerId: '7',
      commissionPercent: 10,
      year: 2026,
      month: 7,
      rows,
    })
    expect(s.grossCents).toBe(8000)
    expect(s.commissionCents).toBe(800) // 10% of 8000
    expect(s.netCents).toBe(7200)
    expect(s.totalActive).toBe(5)
    expect(s.active).toEqual({ adults: 3, children: 2 })
    // The three always reconcile.
    expect(s.commissionCents + s.netCents).toBe(s.grossCents)
  })

  it('rounds commission half-up to the nearest cent', () => {
    // 1 adult = 2000 cents at 12.5% = 250 cents exactly (no rounding needed),
    // use 1 child = 1000 cents at 12.5% = 125 cents.
    // Force a half-cent: 1 child = 1000 cents at 0.05% = 0.5 cents -> rounds to 1.
    const s = buildReconciliationStatement({
      partnerId: '7',
      commissionPercent: 0.05,
      year: 2026,
      month: 7,
      rows: [row({ type: 'child' })],
    })
    expect(s.grossCents).toBe(1000)
    expect(s.commissionCents).toBe(1) // round(0.5) = 1
    expect(s.netCents).toBe(999)
  })

  it('uses the partner OWN rate (per-partner), not a global default', () => {
    const rows = [row({ type: 'adult' })] // €20 = 2000 cents
    const at10 = buildReconciliationStatement({ partnerId: '1', commissionPercent: 10, year: 2026, month: 7, rows })
    const at25 = buildReconciliationStatement({ partnerId: '2', commissionPercent: 25, year: 2026, month: 7, rows })
    expect(at10.commissionCents).toBe(200)
    expect(at25.commissionCents).toBe(500)
    expect(at10.netCents).toBe(1800)
    expect(at25.netCents).toBe(1500)
  })
})

describe('buildReconciliationStatement — cancelled exclusion', () => {
  it('excludes cancelled tickets from gross/commission/net but counts them', () => {
    const rows = [
      row({ type: 'adult', status: 'active' }), // billable 2000
      row({ type: 'adult', status: 'cancelled', cancelReason: 'storno' }),
      row({ type: 'child', status: 'cancelled', cancelReason: 'refund' }),
    ]
    const s = buildReconciliationStatement({ partnerId: '7', commissionPercent: 10, year: 2026, month: 7, rows })
    expect(s.grossCents).toBe(2000) // only the active adult
    expect(s.totalActive).toBe(1)
    expect(s.cancelledCount).toBe(2)
    expect(s.stornoCount).toBe(1)
    expect(s.refundCount).toBe(1)
    expect(s.commissionCents).toBe(200)
    expect(s.netCents).toBe(1800)
  })
})

describe('buildReconciliationStatement — multi-show grouping', () => {
  it('groups by showId, sorted by label, with per-show gross', () => {
    const rows = [
      row({ showId: '2', showLabel: '2026-08-01 · Centar za kulturu', type: 'adult' }),
      row({ showId: '1', showLabel: '2026-07-12 · Ljetno kino', type: 'adult' }),
      row({ showId: '1', showLabel: '2026-07-12 · Ljetno kino', type: 'child' }),
      row({ showId: '1', showLabel: '2026-07-12 · Ljetno kino', status: 'cancelled', cancelReason: 'storno' }),
    ]
    const s = buildReconciliationStatement({ partnerId: '7', commissionPercent: 10, year: 2026, month: 7, rows })
    expect(s.shows).toHaveLength(2)
    // Sorted by label: 2026-07-12 first, 2026-08-01 second.
    expect(s.shows[0].showId).toBe('1')
    expect(s.shows[0].active).toEqual({ adults: 1, children: 1 })
    expect(s.shows[0].grossCents).toBe(3000) // 2000 + 1000
    expect(s.shows[0].cancelledCount).toBe(1)
    expect(s.shows[1].showId).toBe('2')
    expect(s.shows[1].grossCents).toBe(2000)
    // Totals across shows.
    expect(s.grossCents).toBe(5000)
    expect(s.totalActive).toBe(3)
  })

  it('returns an empty statement for no rows', () => {
    const s = buildReconciliationStatement({ partnerId: '7', commissionPercent: 10, year: 2026, month: 7, rows: [] })
    expect(s.shows).toHaveLength(0)
    expect(s.grossCents).toBe(0)
    expect(s.commissionCents).toBe(0)
    expect(s.netCents).toBe(0)
    expect(s.totalActive).toBe(0)
  })
})

describe('monthKeyInZagreb', () => {
  it('buckets a late-night UTC instant into the correct Zagreb local month', () => {
    // 2026-06-30 23:30 UTC is 2026-07-01 01:30 in Zagreb (CEST, +2).
    expect(monthKeyInZagreb('2026-06-30T23:30:00.000Z')).toEqual({ year: 2026, month: 7 })
  })
  it('keeps a mid-day instant in its own month', () => {
    expect(monthKeyInZagreb('2026-07-15T12:00:00.000Z')).toEqual({ year: 2026, month: 7 })
  })
})

describe('centsToEur', () => {
  it('formats whole and fractional euros', () => {
    expect(centsToEur(8000)).toBe('80.00')
    expect(centsToEur(4050)).toBe('40.50')
    expect(centsToEur(5)).toBe('0.05')
    expect(centsToEur(0)).toBe('0.00')
    expect(centsToEur(-150)).toBe('-1.50')
  })
})
