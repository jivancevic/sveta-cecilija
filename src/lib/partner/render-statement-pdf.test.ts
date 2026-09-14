import { describe, expect, it } from 'vitest'
import { buildReconciliationStatement, type ReconTicketRow } from './partner-reconciliation'
import { buildStatementDocument } from './statement-document'
import { renderStatementPdf } from './render-statement-pdf'

// A REAL react-pdf render, the way `render-tickets-pdf.test.ts` does it.
//
// The assertions are thin on purpose — a PDF's bytes are not a thing to assert
// on — but the render itself is the test: it is the only thing that catches a
// font file that did not ship, a logo path that moved, or a style the renderer
// refuses. Every one of those fails at runtime and at no other time, and one of
// them has shipped before (`next_font_dockerignore_gotcha`).

function rows(count: number, over: Partial<ReconTicketRow> = {}): ReconTicketRow[] {
  return Array.from({ length: count }, (_, i) => ({
    showId: `s${(i % 3) + 1}`,
    showLabel: `2026-08-0${(i % 3) + 1} · Ljetno kino`,
    showDate: `2026-08-0${(i % 3) + 1}`,
    showVenue: i % 2 === 0 ? 'ljetno-kino' : 'zimsko-kino',
    type: i % 4 === 0 ? 'child' : 'adult',
    status: 'active',
    orderCreatedAt: '2026-08-02T10:00:00.000Z',
    ...over,
  }))
}

function doc(ticketRows: ReconTicketRow[], partner = {}) {
  return buildStatementDocument({
    statement: buildReconciliationStatement({
      partnerId: '4',
      commissionPercent: 10,
      year: 2026,
      month: 8,
      rows: ticketRows,
    }),
    partner: {
      name: 'Kaleta putnička agencija d.o.o.',
      oib: '12345678901',
      billingAddress: 'Ulica kralja Tomislava 1\n20260 Korčula',
      ...partner,
    },
  })
}

describe('renderStatementPdf (real react-pdf render)', () => {
  it('renders a month with sales', async () => {
    const buf = await renderStatementPdf({ doc: doc(rows(30)) })
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(5000)
  }, 30000)

  it('renders a month with nothing in it', async () => {
    const buf = await renderStatementPdf({ doc: doc([]) })
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  }, 30000)

  it('renders a partner with no OIB and no address', async () => {
    const buf = await renderStatementPdf({
      doc: doc(rows(3), { oib: null, billingAddress: null }),
    })
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  }, 30000)

  // A season's worth of evenings in one month does not happen, but a table that
  // runs past one page must break rather than clip: the header is `fixed`, so
  // page two carries its own column heads.
  it('renders a table long enough to break across pages', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      showId: `s${i}`,
      showLabel: `2026-08-${String((i % 28) + 1).padStart(2, '0')} · Ljetno kino`,
      showDate: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
      showVenue: 'ljetno-kino',
      type: 'adult' as const,
      status: 'active' as const,
      orderCreatedAt: '2026-08-02T10:00:00.000Z',
    }))
    const buf = await renderStatementPdf({ doc: doc(many) })
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  }, 30000)
})
