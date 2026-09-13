import { describe, expect, it } from 'vitest'
import { BOOKING_ENQUIRY_TYPES } from '@/lib/dashboard/inquiries'
import { inquiryCountSql, inquiryListSql, inquiryNewCountSql } from './inquiries-sql'

/** Whitespace-insensitive, so a reformat of the statement is not a failure. */
function flat(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

describe('inquiryListSql — the state filter', () => {
  it('reads the whole inbox when no state is asked for', () => {
    const { text, values } = inquiryListSql({ state: null, page: 1, perPage: 25 })
    expect(flat(text)).not.toContain('WHERE')
    expect(values).not.toContain('handled')
  })

  it('narrows to one state when one is asked for', () => {
    for (const state of ['new', 'handled'] as const) {
      const { text, values } = inquiryListSql({ state, page: 1, perPage: 25 })
      expect(flat(text)).toContain('WHERE status::text = $')
      expect(values).toContain(state)
    }
  })
})

describe('inquiryListSql — the order the inbox is read in', () => {
  const { text, values } = inquiryListSql({ state: null, page: 1, perPage: 25 })

  it('puts what nobody has answered first', () => {
    const order = flat(text).slice(flat(text).indexOf('ORDER BY'))
    expect(order.indexOf('status::text = $')).toBeLessThan(order.indexOf('enquiry_type::text'))
    expect(values[0]).toBe('new')
  })

  it('lifts a booking enquiry above a general one, from the one list of them', () => {
    expect(flat(text)).toContain('enquiry_type::text = ANY($2::text[])')
    expect(values[1]).toEqual([...BOOKING_ENQUIRY_TYPES])
  })

  it('breaks the remaining ties by newest first', () => {
    const order = flat(text).slice(flat(text).indexOf('ORDER BY'))
    expect(order).toContain('created_at DESC')
  })
})

describe('inquiryListSql — paging', () => {
  it('asks for one page and skips the ones before it', () => {
    const { text, values } = inquiryListSql({ state: null, page: 3, perPage: 25 })
    expect(flat(text)).toMatch(/LIMIT \$\d+ OFFSET \$\d+/)
    expect(values.slice(-2)).toEqual([25, 50])
  })

  it('treats a page below one as the first page', () => {
    expect(inquiryListSql({ state: null, page: 0, perPage: 25 }).values.slice(-1)).toEqual([0])
  })
})

describe('the two counts', () => {
  it('counts the same rows the list would return', () => {
    const { text, values } = inquiryCountSql('handled')
    expect(flat(text)).toContain('count(*)')
    expect(flat(text)).toContain('WHERE status::text = $1')
    expect(values).toEqual(['handled'])
  })

  it('counts everything when no state is asked for', () => {
    const { text, values } = inquiryCountSql(null)
    expect(flat(text)).not.toContain('WHERE')
    expect(values).toEqual([])
  })

  it('counts what is still unanswered, for the badge', () => {
    const { text, values } = inquiryNewCountSql()
    expect(flat(text)).toContain('WHERE status::text = $1')
    expect(values).toEqual(['new'])
  })
})
