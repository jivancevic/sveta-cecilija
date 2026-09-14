import { describe, expect, it } from 'vitest'
import { buildReconciliationStatement, type ReconTicketRow } from './partner-reconciliation'
import { statementToCsv } from './reconciliation-csv'
import { buildStatementDocument } from './statement-document'

// The spreadsheet half of the Obračun (#146, rewritten by #599).
//
// Every assertion here is about ONE machine: the secretary's Excel, set to
// Croatian. The file that shipped until #599 was comma-separated UTF-8 with no
// BOM and English headers, which that machine opens as a single column of
// mojibake — so these are not style preferences, they are the difference
// between a usable file and one repaired by hand every month.

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

function csv(rows: ReconTicketRow[], partner = {}) {
  return statementToCsv(
    buildStatementDocument({
      statement: buildReconciliationStatement({
        partnerId: '4',
        commissionPercent: 10,
        year: 2026,
        month: 8,
        rows,
      }),
      partner: { name: 'Kaleta', oib: '12345678901', billingAddress: 'Trg 1', ...partner },
    }),
  )
}

describe('what makes Croatian Excel open it as a spreadsheet', () => {
  it('opens with a UTF-8 BOM', () => {
    expect(csv([row()]).charCodeAt(0)).toBe(0xfeff)
  })

  it('separates with a semicolon, because the comma is the decimal mark', () => {
    const lines = csv([row()]).split('\r\n')
    expect(lines.find((l) => l.startsWith('Partner'))).toBe('Partner;Kaleta')
  })

  it('writes amounts with a decimal comma, so a column can be summed', () => {
    const out = csv([row(), row({ type: 'child' })])
    expect(out).toContain('Vrijednost prodanog;30,00')
    expect(out).toContain('Provizija 10%;3,00')
    expect(out).toContain('Za uplatu HGD-u;27,00')
  })

  it('ends its lines the way RFC-4180 says', () => {
    expect(csv([row()])).toContain('\r\n')
  })

  it('quotes a value carrying the separator, and nothing else', () => {
    const out = csv([row()], { name: 'Kaleta; Korčula' })
    expect(out).toContain('Partner;"Kaleta; Korčula"')
    // A comma is ordinary text under a semicolon separator and stays unquoted.
    expect(csv([row()], { name: 'Kaleta, Korčula' })).toContain('Partner;Kaleta, Korčula')
  })
})

describe('what the document says', () => {
  it('is Croatian throughout, with no English left anywhere', () => {
    const out = csv([row()])
    for (const word of ['Show', 'Adults', 'Children', 'Gross', 'Net payable', 'TOTAL,', 'August']) {
      expect(out).not.toContain(word)
    }
    expect(out).toContain('Datum izvedbe;Mjesto;Odrasli;Djeca;Ulaznica;Vrijednost (EUR)')
    expect(out).toContain('UKUPNO')
  })

  it('says the period is bucketed by SALE date', () => {
    expect(csv([row()])).toContain('Razdoblje;prodaja 1. 8. do 31. 8. 2026.')
  })

  it('carries the OIB and the address the accountant raises the račun from', () => {
    const out = csv([row()])
    expect(out).toContain('OIB;12345678901')
    expect(out).toContain('Adresa;Trg 1')
  })

  it('drops a line it has nothing for rather than printing an empty label', () => {
    const out = csv([row()], { oib: null, billingAddress: null })
    expect(out).not.toContain('OIB;')
    expect(out).not.toContain('Adresa;')
  })

  it('names who issues the invoice, and gives no bank details at all', () => {
    const out = csv([row()])
    expect(out).toContain('Na temelju ovog obračuna knjigovodstvo izdaje račun.')
    expect(out).not.toMatch(/IBAN|HR\d{2}/)
  })
})

describe('storno on the spreadsheet', () => {
  it('is written below the settlement, with its own not-included note', () => {
    const out = csv([row(), row({ status: 'cancelled', cancelReason: 'storno' })])
    expect(out).toContain('Stornirano u razdoblju;1 kom., 20,00 EUR')
    expect(out).toContain('Nije uključeno u iznose iznad.')
    // And the settlement above it is untouched by the void.
    expect(out).toContain('Vrijednost prodanog;20,00')
  })

  it('is written even when nothing was cancelled, because that is an answer too', () => {
    expect(csv([row()])).toContain('Stornirano u razdoblju;0 kom., 0,00 EUR')
  })
})

describe('an empty month', () => {
  it('says so rather than handing over a table with only a header', () => {
    const out = csv([])
    expect(out).toContain('U ovom razdoblju nema prodaje.')
    expect(out).toContain('Za uplatu HGD-u;0,00')
  })
})
