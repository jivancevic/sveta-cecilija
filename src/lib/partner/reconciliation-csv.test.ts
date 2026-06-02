import { describe, it, expect } from 'vitest'
import { buildReconciliationStatement, type ReconTicketRow } from './partner-reconciliation'
import { reconciliationToCsv } from './reconciliation-csv'

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

describe('reconciliationToCsv', () => {
  const statement = buildReconciliationStatement({
    partnerId: '7',
    commissionPercent: 10,
    year: 2026,
    month: 7,
    rows: [
      row({ type: 'adult' }),
      row({ type: 'child' }),
      row({ status: 'cancelled', cancelReason: 'storno' }),
    ],
  })

  it('includes a self-describing header, per-show line, totals, and settlement', () => {
    const csv = reconciliationToCsv(statement, 'Kaleta')
    expect(csv).toContain('Partner,Kaleta')
    expect(csv).toContain('Period,July 2026')
    expect(csv).toContain('Commission rate,10%')
    expect(csv).toContain('Show,Adults,Children,Active tickets,Cancelled,Gross (EUR)')
    // One show line: 1 adult + 1 child active, 1 cancelled, gross €30.00.
    expect(csv).toContain('2026-07-12 · Ljetno kino,1,1,2,1,30.00')
    expect(csv).toContain('TOTAL,1,1,2,1,30.00')
    expect(csv).toContain('Net payable (EUR),27.00')
    expect(csv).toContain('Commission 10% (EUR),3.00')
    expect(csv).toContain('Cancelled (storno),1')
  })

  it('quotes cells containing commas', () => {
    const s = buildReconciliationStatement({
      partnerId: '7',
      commissionPercent: 10,
      year: 2026,
      month: 7,
      rows: [row({ showLabel: 'Show, with comma' })],
    })
    const csv = reconciliationToCsv(s, 'Name, Inc')
    expect(csv).toContain('Partner,"Name, Inc"')
    expect(csv).toContain('"Show, with comma"')
  })
})
