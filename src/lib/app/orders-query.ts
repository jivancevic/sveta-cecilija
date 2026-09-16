// The Narudžbe list's query string, parsed and built (#501).
//
// The whole screen state — the search box, the performance filter, the state
// filter and the page — lives in the URL and nowhere else. That is what makes
// a row survive a reload at the door, lets Skener's "Otvori narudžbu" and
// Izvedbe's "Narudžbe za ovu izvedbu" be plain links, and keeps the list a
// server-rendered page with no store in the browser.
//
// Everything here is pure and defensive: a query string is the one input a
// stranger can hand this screen directly, so a state that is not one of the
// four, a page that is not a whole number and a search term of half a kilobyte
// all resolve to something harmless rather than reaching the database.

import { firstValue, type RawSearchParams } from './screen-state'

/**
 * The four states the ticket names, which are two different questions wearing
 * one control: `active` / `refunded` ask about the money, `partner` / `comp`
 * about the channel. One filter rather than two, because Tatjana picks one of
 * them at a time and a second empty dropdown is a second thing to read.
 */
export const ORDER_STATES = ['active', 'refunded', 'partner', 'comp'] as const

export type OrderState = (typeof ORDER_STATES)[number]

export interface OrdersQuery {
  /** Buyer name, e-mail or order code. Empty string means "no search". */
  q: string
  /** The performance filter, as a bare id. */
  showId: string | null
  state: OrderState | null
  /** One-based; the first page is 1 and is never written into a URL. */
  page: number
}

/** A page of rows: enough that a scroll is rare, few enough to render fast. */
export const ORDERS_PER_PAGE = 25

/**
 * A search term longer than this is not a search, it is a payload. The cap is
 * generous for a real name or an address and short enough that the `like`
 * clauses it becomes stay cheap.
 */
const MAX_QUERY = 80

export function parseOrdersQuery(params: RawSearchParams): OrdersQuery {
  const q = firstValue(params, 'q').replace(/\s+/g, ' ').slice(0, MAX_QUERY)

  const show = firstValue(params, 'show')
  // A relationship id, and nothing that could be read as anything else.
  const showId = /^[A-Za-z0-9_-]{1,64}$/.test(show) ? show : null

  const rawState = firstValue(params, 'state')
  const state = (ORDER_STATES as readonly string[]).includes(rawState)
    ? (rawState as OrderState)
    : null

  const rawPage = firstValue(params, 'page')
  const page = /^\d+$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1

  return { q, showId, state, page }
}

/**
 * The address of one view of the list.
 *
 * One fixed parameter order and no `page=1`, so a filter has exactly one URL:
 * two spellings of the same view would show up as two entries in the browser's
 * history and as two different links in a message.
 */
export function ordersHref(query: OrdersQuery): string {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.showId) params.set('show', query.showId)
  if (query.state) params.set('state', query.state)
  if (query.page > 1) params.set('page', String(query.page))
  const search = params.toString()
  return search ? `/app/orders?${search}` : '/app/orders'
}
