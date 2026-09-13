// How Upiti reads an enquiry out loud (#507).
//
// Every sentence the inbox and the one enquiry print, as pure functions over
// the repo's rows. Nothing here touches the database and nothing here decides
// anything: the ordering is the seam's (`repo/payload/inquiries-sql.ts`), the
// lifecycle is the route's (`inquiries-handled.ts`), and this file only chooses
// words.
//
// The booking classifier is imported rather than re-stated: `dashboard/
// inquiries.ts` has owned "which enquiry types are bookings" since #239, and
// the Backoffice badge, this screen's flag and the inbox's ORDER BY all read
// that one list. A second copy here is how the two surfaces would start
// disagreeing about which enquiries matter.

import { isBookingEnquiry } from '@/lib/dashboard/inquiries'
import type { EnquiryType } from '@/lib/contact/enquiry-type'
import type { InquiryRow } from '@/lib/repo/inquiries'
import type { InquiryState } from './inquiries-query'
import { pluralize } from './roster-loaders'
import { APP_STRINGS, ENQUIRY_TYPE_LABELS } from './strings'
import { zagrebStamp } from './orders-view'

const S = APP_STRINGS.inquiries

/** A request to buy a private izvedba or the experience: the money enquiries. */
export function isBookingInquiry(enquiryType: EnquiryType): boolean {
  return isBookingEnquiry(enquiryType)
}

/** "Privatna moreška" — what the enquirer picked on the public form. */
export function typeLabel(enquiryType: EnquiryType): string {
  return ENQUIRY_TYPE_LABELS[enquiryType] ?? ENQUIRY_TYPE_LABELS.general
}

/** "Novi" / "Riješeni" — the two states of the lifecycle (#239). */
export function stateLabel(state: InquiryState): string {
  return S.states[state]
}

/** "5 upita" — how many rows the filter matched, above the list. */
export function foundLabel(total: number): string {
  return pluralize(total, S.count)
}

/** How much of the message a row shows before the detail is opened. */
export const SNIPPET_LENGTH = 120

/**
 * The message as one line, cut at a word.
 *
 * A row is a tap target, not a reader: the whole message is one tap away and
 * two lines of it here would push the next enquiry off a phone screen. The cut
 * falls on a space when there is one near the end, because a word sliced in
 * half reads as a rendering bug rather than as a preview.
 */
export function snippet(message: string, max: number = SNIPPET_LENGTH): string {
  const text = message.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}...`
}

export interface InquiryRowView {
  href: string
  name: string
  type: string
  /** The flag the inbox lifts these rows by; the badge says the same thing. */
  booking: boolean
  isNew: boolean
  when: string
  preview: string
}

/** Everything one row of the inbox prints, gathered so the page has no logic. */
export function inquiryRowView(inquiry: InquiryRow): InquiryRowView {
  return {
    href: `/app/inquiries/${inquiry.id}`,
    name: inquiry.name.trim() || S.detail.noName,
    type: typeLabel(inquiry.enquiryType),
    booking: isBookingInquiry(inquiry.enquiryType),
    isNew: inquiry.status === 'new',
    when: zagrebStamp(inquiry.createdAt),
    preview: snippet(inquiry.message),
  }
}

export { pageCount } from './orders-view'
