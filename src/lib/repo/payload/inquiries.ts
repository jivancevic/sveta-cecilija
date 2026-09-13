// The Payload-backed `InquiriesRepo` (#507, #475).
//
// Split brain on purpose, and the split is the seam's own rule:
//
//   - **Reads** are SQL on the pool Payload holds open, because the inbox's
//     order is two expressions rather than two columns (`inquiries-sql.ts`
//     says why) and ContactSubmissions has no `beforeRead` hook to lose.
//   - **The write** is `payload.update` with the caller in the `WriteCtx`, so
//     it runs exactly as a Backoffice save does. That is the seam's rule for
//     every write in phase A, and it is what makes replacing this file the
//     whole of phase B for this screen.

import { toEnquiryType } from '@/lib/contact/enquiry-type'
import type { InquiriesRepo, InquiryRow, InquiryState } from '../inquiries'
import { payloadClient, poolOf, type PayloadClient } from './client'
import {
  inquiryCountSql,
  inquiryListSql,
  inquiryNewCountSql,
  type InquiryDbRow,
} from './inquiries-sql'

/** A `timestamptz` arrives as a `Date`; the app prints strings. */
function isoOf(value: Date | string | null): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? '' : new Date(ms).toISOString()
  }
  return ''
}

export function toInquiryRow(row: InquiryDbRow): InquiryRow {
  return {
    id: String(row.id),
    name: (row.name ?? '').trim(),
    // A blank address is NULL, which is the one representation of "there is
    // nobody to reply to" the screen and the mailto builder both read.
    email: (row.email ?? '').trim() || null,
    enquiryType: toEnquiryType(row.enquiry_type),
    status: (row.status === 'handled' ? 'handled' : 'new') as InquiryState,
    message: row.message ?? '',
    createdAt: isoOf(row.created_at),
  }
}

function totalOf(rows: Record<string, unknown>[]): number {
  const total = Number(rows[0]?.total ?? 0)
  return Number.isFinite(total) ? total : 0
}

export function createInquiriesRepo(
  load: () => Promise<PayloadClient> = payloadClient,
): InquiriesRepo {
  return {
    async list(query) {
      const db = poolOf(await load())
      const page = inquiryListSql(query)
      const count = inquiryCountSql(query.state)
      const [rows, totals] = await Promise.all([
        db(page.text, page.values),
        db(count.text, count.values),
      ])
      return {
        rows: rows.rows.map((row) => toInquiryRow(row as unknown as InquiryDbRow)),
        total: totalOf(totals.rows),
      }
    },

    async byId(id) {
      const db = poolOf(await load())
      // The id comes off a URL segment, so it is a parameter and it is cast on
      // the database's side: a non-numeric segment matches nothing rather than
      // erroring, and the page answers "Ovaj upit ne postoji."
      const { rows } = await db(
        `SELECT id, name, email, enquiry_type, status, message, created_at
           FROM contact_submissions
          WHERE id::text = $1
          LIMIT 1`,
        [String(id)],
      )
      const row = rows[0]
      return row ? toInquiryRow(row as unknown as InquiryDbRow) : null
    },

    async setHandled(id, handled, ctx) {
      const payload = await load()
      await payload.update({
        collection: 'contact-submissions',
        id,
        data: { status: handled ? 'handled' : 'new' },
        overrideAccess: true,
        user: ctx.user as Parameters<typeof payload.update>[0]['user'],
      })
    },

    async countNew() {
      const db = poolOf(await load())
      const { text, values } = inquiryNewCountSql()
      const { rows } = await db(text, values)
      return totalOf(rows)
    },
  }
}
