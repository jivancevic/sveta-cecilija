// The Upiti list's query string, parsed and built (#507).
//
// The same contract Narudžbe uses (`orders-query.ts`): the whole screen state
// lives in the URL, so a filter is an address, the back button works, and the
// inbox is a server-rendered page with no store in the browser. The row in the
// notification inbox (#496) links straight at `/app/inquiries`, and a mail to a
// colleague can link at one filtered view of it.
//
// Two filters is all there is, because an enquiry has two states. Everything
// here is pure and defensive: a query string is the one input a stranger hands
// this screen directly, so a state that is not one of the two and a page that
// is not a whole number resolve to the plain inbox rather than reaching the
// database.

/** The lifecycle of one enquiry (`contact_submissions.status`, #239). */
export const INQUIRY_STATES = ['new', 'handled'] as const

export type InquiryState = (typeof INQUIRY_STATES)[number]

export interface InquiriesQuery {
  /** Null means "both", which is the inbox as it opens. */
  state: InquiryState | null
  /** One-based; the first page is 1 and is never written into a URL. */
  page: number
}

/**
 * A page of rows. Twenty-six enquiries exist in total after three seasons, so
 * this is a guard against a future flood rather than a daily fact of the
 * screen: in practice every enquiry fits on page one.
 */
export const INQUIRIES_PER_PAGE = 25

/** Next.js hands `searchParams` as a string, a repeated string, or nothing. */
export type RawSearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export function parseInquiriesQuery(params: RawSearchParams): InquiriesQuery {
  const rawState = first(params.state).trim()
  const state = (INQUIRY_STATES as readonly string[]).includes(rawState)
    ? (rawState as InquiryState)
    : null

  const rawPage = first(params.page).trim()
  const page = /^\d+$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1

  return { state, page }
}

/**
 * The address of one view of the inbox.
 *
 * One fixed parameter order and no `page=1`, so a view has exactly one URL:
 * two spellings of the same list would show up as two entries in the browser's
 * history and as two different links in a message.
 */
export function inquiriesHref(query: InquiriesQuery): string {
  const params = new URLSearchParams()
  if (query.state) params.set('state', query.state)
  if (query.page > 1) params.set('page', String(query.page))
  const search = params.toString()
  return search ? `/app/inquiries?${search}` : '/app/inquiries'
}
