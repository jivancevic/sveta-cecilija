import { describe, expect, it } from 'vitest'
import { buildReconciliationStatement, type ReconTicketRow } from '@/lib/partner/partner-reconciliation'
import {
  clampStatementMonth,
  statementMonths,
  statementSummary,
  statementYears,
} from './statement-view'

// The pure half of Obračun (#505): which months a partner may ask a statement
// for, and how the reconciliation payload reads from the partner's side of the
// table (what they owe, what they keep).

const now = { year: 2026, month: 9 }

describe('statementYears', () => {
  it('offers this season and the two before it, newest first', () => {
    expect(statementYears(now)).toEqual([2026, 2025, 2024])
  })
})

describe('statementMonths', () => {
  it('stops at the current month in the current year: a future month has no sales', () => {
    expect(statementMonths(now, 2026).map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('offers the whole of a past year', () => {
    expect(statementMonths(now, 2025)).toHaveLength(12)
  })

  it('names each month in Croatian', () => {
    expect(statementMonths(now, 2025)[0]).toEqual({ month: 1, label: 'Siječanj' })
    expect(statementMonths(now, 2026).at(-1)).toEqual({ month: 9, label: 'Rujan' })
  })

  it('offers nothing for a year that has not started', () => {
    expect(statementMonths(now, 2027)).toEqual([])
  })
})

describe('clampStatementMonth', () => {
  it('leaves a month that exists in the chosen year alone', () => {
    expect(clampStatementMonth(now, 2026, 7)).toBe(7)
    expect(clampStatementMonth(now, 2025, 12)).toBe(12)
  })

  it('pulls a month past today back to the current one when the year changes', () => {
    // December 2025 selected, then the year flipped to 2026: December has not
    // happened, so the picker lands on the newest month that has.
    expect(clampStatementMonth(now, 2026, 12)).toBe(9)
  })

  it('never returns a month below January', () => {
    expect(clampStatementMonth(now, 2026, 0)).toBe(1)
  })
})

describe('statementSummary', () => {
  const row = (over: Partial<ReconTicketRow> = {}): ReconTicketRow => ({
    showId: '1',
    showLabel: '2026-07-17 · Ljetno kino',
    type: 'adult',
    status: 'active',
    cancelReason: null,
    orderCreatedAt: '2026-07-17T10:00:00.000Z',
    ...over,
  })

  const statement = buildReconciliationStatement({
    partnerId: '7',
    commissionPercent: 10,
    year: 2026,
    month: 7,
    // 3 adults (€60) + 2 children (€20) = €80 gross; one storno on top.
    rows: [
      row(),
      row(),
      row(),
      row({ type: 'child' }),
      row({ type: 'child' }),
      row({ status: 'cancelled', cancelReason: 'storno' }),
    ],
  })

  it('reframes the statement from the partner side: what they keep, what they owe', () => {
    expect(statementSummary(statement)).toEqual({
      ticketsSold: 5,
      cancelledCount: 1,
      grossCents: 8000,
      commissionCents: 800,
      owedCents: 7200,
      commissionPercent: 10,
    })
  })

  it('keeps gross = commission + owed, so the three figures always reconcile', () => {
    const s = statementSummary(statement)
    expect(s.commissionCents + s.owedCents).toBe(s.grossCents)
  })

  it('reads an empty month as five zeros rather than as an error', () => {
    const empty = buildReconciliationStatement({
      partnerId: '7',
      commissionPercent: 15,
      year: 2026,
      month: 2,
      rows: [],
    })
    expect(statementSummary(empty)).toEqual({
      ticketsSold: 0,
      cancelledCount: 0,
      grossCents: 0,
      commissionCents: 0,
      owedCents: 0,
      commissionPercent: 15,
    })
  })
})
