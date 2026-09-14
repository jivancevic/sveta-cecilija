// The `partner_statements` raw table, read and written (#599).
//
// One job: a month that has been marked sent STOPS MOVING. The document is
// stored as it stood, and every later read of that month — the screen, the CSV,
// the PDF — comes from here rather than from a fresh query. A rate change, a
// late storno or a corrected show label cannot rewrite a settlement the
// accountant has already invoiced against.
//
// Plain parameterised SQL on the pool, in the shape every raw-table store in
// this project takes (`src/lib/db/pool-query.ts`), so a route, a test and a
// probe script all reach it the same way and none of them drags Payload along.
//
// There is no "update a sent statement" here on purpose. Un-sending is a
// DELETE, which returns the month to live and makes the next stamp recompute
// it; an in-place edit would be a third way for a settlement to change that
// nobody would think to look for.

import type { PoolQuery } from '@/lib/db/pool-query'
import type { StatementDocument } from './statement-document'

/** A month that has been sent: the frozen document and who stamped it. */
export interface SentStatement {
  partnerId: string
  year: number
  month: number
  document: StatementDocument
  commissionPercent: number
  /** ISO instant. */
  sentAt: string
  sentBy: string | null
}

/** The stamp without the document, for a list of months. */
export interface SentStamp {
  year: number
  month: number
  sentAt: string
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return value == null ? '' : new Date(String(value)).toISOString()
}

function toSent(row: Record<string, unknown>): SentStatement {
  return {
    partnerId: String(row.partner_id),
    year: Number(row.year),
    month: Number(row.month),
    // jsonb comes back parsed from node-postgres; a string would mean the
    // column was written as text somewhere, so parse defensively rather than
    // handing a caller a string where it expects a document.
    document: (typeof row.statement === 'string'
      ? JSON.parse(row.statement)
      : row.statement) as StatementDocument,
    commissionPercent: Number(row.commission_percent),
    sentAt: toIso(row.sent_at),
    sentBy: row.sent_by == null ? null : String(row.sent_by),
  }
}

export interface StatementStore {
  /** The frozen statement for one month, or null while it is still live. */
  find(partnerId: number, year: number, month: number): Promise<SentStatement | null>
  /** Every stamped month of one partner in one year, newest first. */
  stampsIn(partnerId: number, year: number): Promise<SentStamp[]>
  /** Freeze a month. Idempotent: re-stamping keeps the FIRST document. */
  markSent(args: {
    partnerId: number
    year: number
    month: number
    document: StatementDocument
    commissionPercent: number
    sentBy: number | null
  }): Promise<void>
  /** Return a month to live. */
  clearSent(partnerId: number, year: number, month: number): Promise<void>
}

export function createStatementStore(query: PoolQuery): StatementStore {
  return {
    async find(partnerId, year, month) {
      const res = await query(
        `SELECT partner_id, year, month, statement, commission_percent, sent_at, sent_by
           FROM partner_statements
          WHERE partner_id = $1 AND year = $2 AND month = $3`,
        [partnerId, year, month],
      )
      const row = res.rows[0]
      return row ? toSent(row) : null
    },

    async stampsIn(partnerId, year) {
      const res = await query(
        `SELECT year, month, sent_at
           FROM partner_statements
          WHERE partner_id = $1 AND year = $2
          ORDER BY month DESC`,
        [partnerId, year],
      )
      return res.rows.map((r) => ({
        year: Number(r.year),
        month: Number(r.month),
        sentAt: toIso(r.sent_at),
      }))
    },

    async markSent({ partnerId, year, month, document, commissionPercent, sentBy }) {
      // DO NOTHING rather than DO UPDATE, and that is the whole rule: a second
      // stamp on an already-sent month must not replace the document that was
      // actually sent with one computed from today's rows. Two taps from two
      // phones therefore agree, and so do a request and its retry.
      await query(
        `INSERT INTO partner_statements
           (partner_id, year, month, statement, commission_percent, sent_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT (partner_id, year, month) DO NOTHING`,
        [partnerId, year, month, JSON.stringify(document), commissionPercent, sentBy],
      )
    },

    async clearSent(partnerId, year, month) {
      await query(
        `DELETE FROM partner_statements WHERE partner_id = $1 AND year = $2 AND month = $3`,
        [partnerId, year, month],
      )
    },
  }
}
