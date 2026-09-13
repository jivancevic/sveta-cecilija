// The Upiti inbox's read, as Postgres wants it (#507).
//
// Split out of `inquiries.ts` so it can be unit-tested the way `orders-where.ts`
// is: a statement builder does not need a database to be wrong.
//
// **Why SQL and not Payload's `find`.** The inbox is ordered by two facts that
// are not columns — "nobody has answered this yet" and "this one is a booking
// enquiry" — and Payload's `sort` can only name columns. Ordering a page in
// memory after fetching it would reorder within the page and lie across pages,
// which is exactly the bug a pager hides best. Reads bypass no hook
// (ContactSubmissions has none), so the only thing this gives up is a Payload
// document nobody above the seam wants anyway. The WRITE still goes through the
// local API (`inquiries.ts`), which is the seam's rule.
//
// Everything a caller supplies is a parameter, including the list of booking
// types, so the one definition of "a booking enquiry" (`dashboard/inquiries.ts`)
// is also the one the ORDER BY reads.

import { BOOKING_ENQUIRY_TYPES } from '@/lib/dashboard/inquiries'
import type { InquiryListQuery, InquiryState } from '../inquiries'

export interface Statement {
  text: string
  values: unknown[]
}

/** The enquiry nobody has answered: the state the inbox opens on. */
const UNANSWERED: InquiryState = 'new'

const COLUMNS = 'id, name, email, enquiry_type, status, message, created_at'

/**
 * One page of the inbox.
 *
 * The order is the reading order of the screen, in three steps: unanswered
 * first, then the enquiries with money behind them, then newest first. `id` is
 * the last tie-break so two enquiries submitted in the same millisecond cannot
 * swap places between two loads of the same page.
 */
export function inquiryListSql(query: InquiryListQuery): Statement {
  const values: unknown[] = [UNANSWERED, [...BOOKING_ENQUIRY_TYPES]]

  let where = ''
  if (query.state) {
    values.push(query.state)
    where = `WHERE status::text = $${values.length}`
  }

  const perPage = Math.max(1, query.perPage)
  const offset = Math.max(0, (Math.max(1, query.page) - 1) * perPage)
  values.push(perPage, offset)

  const text = `
    SELECT ${COLUMNS}
      FROM contact_submissions
      ${where}
     ORDER BY (status::text = $1) DESC,
              (enquiry_type::text = ANY($2::text[])) DESC,
              created_at DESC,
              id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}
  `
  return { text, values }
}

/** How many rows that page is one of, so the pager knows where it ends. */
export function inquiryCountSql(state: InquiryState | null): Statement {
  if (!state) return { text: 'SELECT count(*)::int AS total FROM contact_submissions', values: [] }
  return {
    text: 'SELECT count(*)::int AS total FROM contact_submissions WHERE status::text = $1',
    values: [state],
  }
}

/** The one number the landing strip and the tab badge would show (#496, #507). */
export function inquiryNewCountSql(): Statement {
  return inquiryCountSql(UNANSWERED)
}

/** One row of `contact_submissions`, as `pg` hands it back. */
export interface InquiryDbRow {
  id: number | string
  name: string | null
  email: string | null
  enquiry_type: string
  status: string
  message: string | null
  /** `pg` returns a timestamp column as a `Date`, never as a string. */
  created_at: Date | string | null
}
