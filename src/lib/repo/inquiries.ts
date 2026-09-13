// InquiriesRepo — the enquiry inbox (#507, #475).
//
// One collection, `contact-submissions`, and the four calls Upiti makes: a page
// of the inbox, one enquiry, the switch that marks it handled, and the count of
// the ones nobody has answered.
//
// The rows carry a stranger's name, address and message, which is the whole
// content of the screen and the reason the screen is behind `tickets`. There is
// deliberately no `create` here: an enquiry is written by the public form
// (`src/app/actions/contact.ts`) and nobody in Cecilija writes one, and no
// `delete`: the Backoffice keeps the raw edit.

import type { EnquiryType } from '@/lib/contact/enquiry-type'
import type { InquiryState } from '@/lib/app/inquiries-query'
import type { WriteCtx } from './auth'

/** One enquiry, as Upiti reads it. Never a Payload document. */
export interface InquiryRow {
  id: string
  name: string
  email: string | null
  enquiryType: EnquiryType
  status: InquiryState
  message: string
  createdAt: string
}

export interface InquiryListQuery {
  /** Null means both states, which is the inbox as it opens. */
  state: InquiryState | null
  /** One-based. */
  page: number
  perPage: number
}

export interface InquiryListResult {
  rows: InquiryRow[]
  /** Matching rows in total, so the pager knows how many pages there are. */
  total: number
}

export interface InquiriesRepo {
  /**
   * One page of the inbox, in its reading order: unanswered first, booking
   * enquiries above general ones, newest first within each.
   */
  list(query: InquiryListQuery): Promise<InquiryListResult>
  /** One enquiry, or null when there is no such row. */
  byId(id: string | number): Promise<InquiryRow | null>
  /**
   * Mark an enquiry handled, or put it back among the new ones.
   *
   * Goes through the collection inside the seam, so the write is attributed the
   * way a Backoffice save is and any hook the collection ever grows keeps
   * running. Idempotent by construction: it writes a state, it does not toggle
   * one, so the same call twice leaves the same row.
   */
  setHandled(id: string | number, handled: boolean, ctx: WriteCtx): Promise<void>
  /** How many enquiries are still unanswered (the badge's one number). */
  countNew(): Promise<number>
}

export type { InquiryState }
