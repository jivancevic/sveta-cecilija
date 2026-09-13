import { describe, expect, it } from 'vitest'
import { inquiriesHref, parseInquiriesQuery, type InquiriesQuery } from './inquiries-query'

const EMPTY: InquiriesQuery = { state: null, page: 1 }

describe('parseInquiriesQuery', () => {
  it('reads nothing as the whole inbox, page one', () => {
    expect(parseInquiriesQuery({})).toEqual(EMPTY)
  })

  it('reads the two states the screen offers', () => {
    expect(parseInquiriesQuery({ state: 'new' })).toEqual({ state: 'new', page: 1 })
    expect(parseInquiriesQuery({ state: 'handled' })).toEqual({ state: 'handled', page: 1 })
  })

  it('drops a state that is not one of the two', () => {
    expect(parseInquiriesQuery({ state: 'deleted' }).state).toBeNull()
    expect(parseInquiriesQuery({ state: "new' OR 1=1" }).state).toBeNull()
    expect(parseInquiriesQuery({ state: '' }).state).toBeNull()
  })

  it('takes the first value when a parameter is repeated', () => {
    expect(parseInquiriesQuery({ state: ['handled', 'new'] }).state).toBe('handled')
  })

  it('reads a whole page number and falls back to one', () => {
    expect(parseInquiriesQuery({ page: '3' }).page).toBe(3)
    expect(parseInquiriesQuery({ page: '0' }).page).toBe(1)
    expect(parseInquiriesQuery({ page: '-2' }).page).toBe(1)
    expect(parseInquiriesQuery({ page: '2.5' }).page).toBe(1)
    expect(parseInquiriesQuery({ page: 'last' }).page).toBe(1)
  })
})

describe('inquiriesHref', () => {
  it('gives the unfiltered inbox one address, with no page=1 in it', () => {
    expect(inquiriesHref(EMPTY)).toBe('/app/inquiries')
  })

  it('writes the state and the page in one fixed order', () => {
    expect(inquiriesHref({ state: 'new', page: 2 })).toBe('/app/inquiries?state=new&page=2')
    expect(inquiriesHref({ state: 'handled', page: 1 })).toBe('/app/inquiries?state=handled')
    expect(inquiriesHref({ state: null, page: 4 })).toBe('/app/inquiries?page=4')
  })

  it('round-trips through the parser', () => {
    const query: InquiriesQuery = { state: 'handled', page: 3 }
    const href = inquiriesHref(query)
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams)
    expect(parseInquiriesQuery(params)).toEqual(query)
  })
})
