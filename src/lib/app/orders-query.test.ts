import { describe, expect, it } from 'vitest'
import {
  ORDERS_PER_PAGE,
  ordersHref,
  parseOrdersQuery,
  type OrdersQuery,
} from './orders-query'

// What the Narudžbe list reads off its own URL (#501).
//
// The list is a GET screen: the search box, the two filters and the page are
// all in the query string, so a row Tatjana is looking at survives a reload, a
// back button and a link pasted into a message. That makes the parser the
// screen's contract, and a hostile query string reaches it directly.

describe('parseOrdersQuery', () => {
  it('reads an empty query as the unfiltered first page', () => {
    expect(parseOrdersQuery({})).toEqual<OrdersQuery>({
      q: '',
      showId: null,
      state: null,
      page: 1,
    })
  })

  it('trims the search term and collapses its inner whitespace', () => {
    expect(parseOrdersQuery({ q: '  ivan   horvat ' }).q).toBe('ivan horvat')
  })

  it('caps a very long search term rather than passing it to the database', () => {
    const long = 'a'.repeat(500)
    expect(parseOrdersQuery({ q: long }).q).toHaveLength(80)
  })

  it('takes the four states and nothing else', () => {
    expect(parseOrdersQuery({ state: 'active' }).state).toBe('active')
    expect(parseOrdersQuery({ state: 'refunded' }).state).toBe('refunded')
    expect(parseOrdersQuery({ state: 'partner' }).state).toBe('partner')
    expect(parseOrdersQuery({ state: 'comp' }).state).toBe('comp')
    expect(parseOrdersQuery({ state: 'online' }).state).toBeNull()
    expect(parseOrdersQuery({ state: 'DROP TABLE orders' }).state).toBeNull()
  })

  it('accepts a plain id for the performance filter and refuses anything else', () => {
    expect(parseOrdersQuery({ show: '6' }).showId).toBe('6')
    expect(parseOrdersQuery({ show: ' 6 ' }).showId).toBe('6')
    expect(parseOrdersQuery({ show: '' }).showId).toBeNull()
    expect(parseOrdersQuery({ show: "1 or 1=1" }).showId).toBeNull()
  })

  it('clamps the page to a whole number of at least one', () => {
    expect(parseOrdersQuery({ page: '3' }).page).toBe(3)
    expect(parseOrdersQuery({ page: '0' }).page).toBe(1)
    expect(parseOrdersQuery({ page: '-2' }).page).toBe(1)
    expect(parseOrdersQuery({ page: '2.7' }).page).toBe(1)
    expect(parseOrdersQuery({ page: 'last' }).page).toBe(1)
  })

  it('reads the first value when a parameter is repeated', () => {
    expect(parseOrdersQuery({ q: ['ivan', 'marko'] }).q).toBe('ivan')
  })
})

describe('ordersHref', () => {
  const base: OrdersQuery = { q: '', showId: null, state: null, page: 1 }

  it('is the bare route when nothing is filtered', () => {
    expect(ordersHref(base)).toBe('/app/orders')
  })

  it('writes the parameters in one fixed order, page last', () => {
    expect(ordersHref({ q: 'ivan', showId: '6', state: 'refunded', page: 2 })).toBe(
      '/app/orders?q=ivan&show=6&state=refunded&page=2',
    )
  })

  it('omits page 1, so the first page of a filter has one address', () => {
    expect(ordersHref({ ...base, state: 'comp' })).toBe('/app/orders?state=comp')
  })

  it('escapes a search term', () => {
    expect(ordersHref({ ...base, q: 'ivan horvat & co' })).toBe(
      '/app/orders?q=ivan+horvat+%26+co',
    )
  })

  it('round-trips whatever the parser produced', () => {
    const parsed = parseOrdersQuery({ q: 'ivan', show: '6', state: 'partner', page: '4' })
    expect(parseOrdersQuery(Object.fromEntries(new URL(`http://x${ordersHref(parsed)}`).searchParams))).toEqual(
      parsed,
    )
  })

  // The Skener's "Otvori narudžbu" and the Izvedbe screen's "Narudžbe za ovu
  // izvedbu" both link here, and the second one carries only a show.
  it('is the link those two screens build', () => {
    expect(ordersHref({ ...base, showId: '6' })).toBe('/app/orders?show=6')
  })
})

describe('ORDERS_PER_PAGE', () => {
  it('is a page a thumb can scroll without a second breath', () => {
    expect(ORDERS_PER_PAGE).toBe(25)
  })
})
