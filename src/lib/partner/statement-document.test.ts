import { describe, expect, it } from 'vitest'
import { buildReconciliationStatement, type ReconTicketRow } from './partner-reconciliation'
import {
  amountForCsv,
  amountForPrint,
  buildStatementDocument,
  formatStatementDay,
  formatStatementPeriod,
  partnerSlug,
  statementFileBase,
} from './statement-document'

// The document HGD sends a reseller (#599).
//
// These assertions are the ones a future change would otherwise break quietly:
// the Croatian a bookkeeper reads, the period that says it is bucketed by SALE
// date, and the rule that storno never touches a sum.

function row(over: Partial<ReconTicketRow> = {}): ReconTicketRow {
  return {
    showId: 's1',
    showLabel: '2026-08-17 · Ljetno kino',
    showDate: '2026-08-17',
    showVenue: 'ljetno-kino',
    type: 'adult',
    status: 'active',
    orderCreatedAt: '2026-08-02T10:00:00.000Z',
    ...over,
  }
}

function doc(rows: ReconTicketRow[], commissionPercent = 10) {
  return buildStatementDocument({
    statement: buildReconciliationStatement({
      partnerId: '4',
      commissionPercent,
      year: 2026,
      month: 8,
      rows,
    }),
    partner: { name: 'Kaleta', oib: '12345678901', billingAddress: 'Trg 1\n20260 Korčula' },
  })
}

describe('the period', () => {
  it('covers the whole month and names the SALE days, not the evenings', () => {
    const d = doc([row()])
    expect(d.periodFrom).toBe('2026-08-01')
    expect(d.periodTo).toBe('2026-08-31')
    expect(d.periodLabel).toBe('1. 8. do 31. 8. 2026.')
  })

  it('knows a short month and a leap February', () => {
    expect(formatStatementPeriod(2026, 2)).toBe('1. 2. do 28. 2. 2026.')
    expect(formatStatementPeriod(2028, 2)).toBe('1. 2. do 29. 2. 2028.')
    expect(formatStatementPeriod(2026, 11)).toBe('1. 11. do 30. 11. 2026.')
  })

  it('titles the month in Croatian', () => {
    expect(doc([row()]).monthLabel).toBe('Kolovoz 2026.')
  })
})

describe('the lines', () => {
  it('prints the evening in Croatian and names the venue, not its slug', () => {
    const [line] = doc([row()]).lines
    expect(line.date).toBe('17. 8. 2026.')
    expect(line.venue).toBe('Ljetno kino')
  })

  it('splits adults from children and counts the pieces', () => {
    const d = doc([row(), row(), row({ type: 'child' })])
    expect(d.lines[0]).toMatchObject({ adults: 2, children: 1, tickets: 3, grossCents: 5000 })
  })

  it('keeps the evenings in calendar order, whatever order the rows arrive in', () => {
    const d = doc([
      row({ showId: 'b', showDate: '2026-08-24', showLabel: '2026-08-24 · Ljetno kino' }),
      row({ showId: 'a', showDate: '2026-08-03', showLabel: '2026-08-03 · Ljetno kino' }),
    ])
    expect(d.lines.map((l) => l.date)).toEqual(['3. 8. 2026.', '24. 8. 2026.'])
  })

  it('leaves a date it cannot parse alone rather than printing NaN', () => {
    expect(formatStatementDay('')).toBe('')
    expect(formatStatementDay('not a date')).toBe('not a date')
  })
})

describe('the settlement', () => {
  it('is ukupno minus the commission, which is what HGD invoices', () => {
    const d = doc([row(), row(), row({ type: 'child' })])
    expect(d.totals.grossCents).toBe(5000)
    expect(d.totals.commissionCents).toBe(500)
    expect(d.totals.netCents).toBe(4500)
    expect(d.totals.grossCents).toBe(d.totals.commissionCents + d.totals.netCents)
  })

  it('carries the partner at that moment, because the račun is raised from it', () => {
    const d = doc([row()])
    expect(d.partner).toEqual({
      name: 'Kaleta',
      oib: '12345678901',
      billingAddress: 'Trg 1\n20260 Korčula',
    })
  })
})

describe('storno', () => {
  // The rule the whole document is shaped around: a void is on the page so the
  // partner can tick it off, and it is in NO sum, because the invoice is net.
  it('never reaches gross, commission or net', () => {
    const live = doc([row(), row()])
    const withVoids = doc([
      row(),
      row(),
      row({ status: 'cancelled', cancelReason: 'storno' }),
      row({ status: 'cancelled', cancelReason: 'refund', type: 'child' }),
    ])
    expect(withVoids.totals).toEqual(live.totals)
  })

  it('is reported as its own count and its own face value', () => {
    const d = doc([
      row(),
      row({ status: 'cancelled', cancelReason: 'storno' }),
      row({ status: 'cancelled', cancelReason: 'refund', type: 'child' }),
    ])
    expect(d.cancelled).toEqual({ count: 2, cents: 3000, stornoCount: 1, refundCount: 1 })
  })
})

describe('amounts', () => {
  it('uses a decimal comma and no thousands separator in a CSV cell', () => {
    expect(amountForCsv(4050)).toBe('40,50')
    expect(amountForCsv(123456)).toBe('1234,56')
    expect(amountForCsv(0)).toBe('0,00')
    expect(amountForCsv(-500)).toBe('-5,00')
  })

  it('groups thousands the Croatian way when a human reads it', () => {
    expect(amountForPrint(123456)).toBe('1.234,56')
    expect(amountForPrint(123456789)).toBe('1.234.567,89')
    expect(amountForPrint(900)).toBe('9,00')
  })
})

describe('the filename', () => {
  it('folds Croatian letters rather than dropping them', () => {
    expect(partnerSlug('Čanak & Šibenik d.o.o.')).toBe('canak-sibenik-d-o-o')
    expect(partnerSlug('Kaleta')).toBe('kaleta')
  })

  it('never produces a file that names nobody', () => {
    expect(partnerSlug('!!!')).toBe('partner')
  })

  it('is Croatian, and both downloads share it', () => {
    expect(statementFileBase(doc([row()]))).toBe('obracun-kaleta-2026-08')
  })
})
