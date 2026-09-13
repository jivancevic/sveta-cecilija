// What Upiti loads on the server (#507).
//
// The IO wiring and nothing else, in the `orders-data.ts` shape: the filter's
// rules live in `inquiries-query.ts`, the wording in `inquiries-view.ts`, the
// order and the SQL inside the seam. This file only asks.
//
// It reaches the database through `getRepo()` (ADR-0027 decision 5), so it
// imports no Payload and needs no entry in the repo guard's allow-list.

import { getRepo } from '@/lib/repo'
import type { InquiryListResult, InquiryRow } from '@/lib/repo/inquiries'
import { INQUIRIES_PER_PAGE, type InquiriesQuery } from './inquiries-query'

/** One page of the inbox, in its reading order. */
export async function loadInquiries(query: InquiriesQuery): Promise<InquiryListResult> {
  return getRepo().inquiries.list({ ...query, perPage: INQUIRIES_PER_PAGE })
}

/** One enquiry, or null when the id is not one. */
export async function loadInquiry(id: string): Promise<InquiryRow | null> {
  return getRepo().inquiries.byId(id)
}

/**
 * How many enquiries nobody has answered yet.
 *
 * Exposed as a loader of its own because the count belongs to more than this
 * screen: the landing strip and a badge on the Upiti tab are both decided
 * elsewhere (#471, #496), and whichever of them lands first should find the
 * number already behind the seam rather than write a second query for it. The
 * screens table (`lib/app/screens.ts`) carries no badge today and a screen
 * ticket does not change its contract, so nothing calls this from the shell
 * yet.
 */
export async function countNewInquiries(): Promise<number> {
  return getRepo().inquiries.countNew()
}

export type { InquiryListResult, InquiryRow }
