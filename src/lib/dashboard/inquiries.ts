// Enquiry-lifecycle logic for the dashboard inquiries badge (issue #239, ADR-0015).
//
// An enquiry (ContactSubmissions row) has a lifecycle `status: new → handled`.
// The dashboard badge counts `status = 'new'` honestly and highlights how many
// of those are *booking* enquiries (private-moreska / moreska-experience), the
// revenue leads, within the total — e.g. "5 new, incl. 2 booking enquiries".
//
// All the real logic lives here as pure functions so it is unit-testable away
// from Payload/React; the badge component and the admin branch just call in.

import type { AdminLang } from '@/lib/admin-i18n'

// The enquiry types that count as booking enquiries (requests to *buy* a private
// show or the experience), as opposed to general questions. Source of truth for
// the badge's booking sub-count. Mirrors ContactSubmissions.enquiryType options.
export const BOOKING_ENQUIRY_TYPES = ['private-moreska', 'moreska-experience'] as const

export type BookingEnquiryType = (typeof BOOKING_ENQUIRY_TYPES)[number]

export type InquiryStatus = 'new' | 'handled'

export type InquiryRow = {
  status?: InquiryStatus | string | null
  enquiryType?: string | null
}

export type InquiryCounts = {
  // Number of enquiries still `new` (the badge's headline figure).
  count: number
  // Of those `new` enquiries, how many are booking enquiries (the highlight).
  bookingCount: number
}

// Is this enquiry type a booking enquiry (a revenue lead)?
export function isBookingEnquiry(enquiryType: string | null | undefined): boolean {
  return BOOKING_ENQUIRY_TYPES.includes(enquiryType as BookingEnquiryType)
}

// Count the `new` enquiries and, within that, the booking sub-count. Handled
// enquiries are excluded from both figures so marking one handled drops it from
// the badge.
export function countInquiries(rows: readonly InquiryRow[]): InquiryCounts {
  let count = 0
  let bookingCount = 0
  for (const row of rows) {
    if (row.status !== 'new') continue
    count++
    if (isBookingEnquiry(row.enquiryType)) bookingCount++
  }
  return { count, bookingCount }
}

// Build the inquiries-badge copy for the active language. The headline is the
// `new` count; when some of those are booking enquiries, a sub-clause calls them
// out. No em-dashes (HARD RULE): the booking clause is comma-joined.
// e.g. EN "5 new, incl. 2 booking enquiries"; HR "5 novih, uklj. 2 za rezervaciju".
export function formatInquiriesBadge(lang: AdminLang, counts: InquiryCounts): string {
  const { count, bookingCount } = counts
  if (lang === 'hr') {
    const head = `${count} ${count === 1 ? 'nova' : 'novih'}`
    if (bookingCount <= 0) return head
    // "za" governs the accusative, so the noun stays "rezervaciju" (acc. sg.) for
    // every count, treating "za rezervaciju" as the booking category, not a plural.
    return `${head}, uklj. ${bookingCount} za rezervaciju`
  }
  const head = `${count} new`
  if (bookingCount <= 0) return head
  const noun = bookingCount === 1 ? 'booking enquiry' : 'booking enquiries'
  return `${head}, incl. ${bookingCount} ${noun}`
}

// Drive the new → handled transition. The target status is owned here (not by
// the caller) so the lifecycle's end state lives in one place; the actual write
// is injected so this stays unit-testable away from Payload. Idempotent:
// re-running on an already-handled row writes 'handled' again, a harmless no-op.
export type HandledResult = { id: number | string; status: InquiryStatus }

export async function markEnquiryHandled(
  id: number | string,
  deps: { setStatus: (id: number | string, status: InquiryStatus) => Promise<unknown> },
): Promise<HandledResult> {
  await deps.setStatus(id, 'handled')
  return { id, status: 'handled' }
}
