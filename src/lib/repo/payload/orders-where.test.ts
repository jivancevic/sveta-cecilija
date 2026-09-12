import { describe, expect, it } from 'vitest'
import { whereForOrderList } from './orders-where'

// The Narudžbe list's `where`, built once and asserted here (#501).
//
// It lives inside the seam because "a search is three clauses ORed together" is
// a Payload query fact, while "a search covers the name, the address and the
// code" is the screen's rule and lives in `lib/app/orders-query.ts`. A test at
// this seam is what lets the list's filters be trusted without a database:
// a state filter that quietly matched nothing, or a search that quietly matched
// everything, both look identical from the page.

const EMPTY = { q: '', showId: null, state: null, page: 1, perPage: 25 }

describe('whereForOrderList', () => {
  it('is unfiltered when nothing is asked for', () => {
    expect(whereForOrderList(EMPTY)).toEqual({})
  })

  it('scopes to one performance, with a numeric id as a number', () => {
    expect(whereForOrderList({ ...EMPTY, showId: '6' })).toEqual({
      and: [{ show: { equals: 6 } }],
    })
  })

  it('leaves a non-numeric id alone rather than turning it into NaN', () => {
    expect(whereForOrderList({ ...EMPTY, showId: 'abc' })).toEqual({
      and: [{ show: { equals: 'abc' } }],
    })
  })

  describe('the state filter', () => {
    it('"active" is every order whose money has not gone back', () => {
      expect(whereForOrderList({ ...EMPTY, state: 'active' })).toEqual({
        and: [{ refundStatus: { not_equals: 'refunded' } }],
      })
    })

    it('"refunded" is the other side of the same column', () => {
      expect(whereForOrderList({ ...EMPTY, state: 'refunded' })).toEqual({
        and: [{ refundStatus: { equals: 'refunded' } }],
      })
    })

    it('"partner" and "comp" are channels, not refund states', () => {
      expect(whereForOrderList({ ...EMPTY, state: 'partner' })).toEqual({
        and: [{ channel: { equals: 'partner' } }],
      })
      expect(whereForOrderList({ ...EMPTY, state: 'comp' })).toEqual({
        and: [{ channel: { equals: 'comp' } }],
      })
    })
  })

  describe('the search box', () => {
    it('matches the name, the address or the code, in one OR', () => {
      expect(whereForOrderList({ ...EMPTY, q: 'ivan' })).toEqual({
        and: [
          {
            or: [
              { and: [{ buyerName: { like: 'ivan' } }] },
              { email: { like: 'ivan' } },
              { code: { equals: 'IVAN' } },
            ],
          },
        ],
      })
    })

    it('ANDs the words of a name, so "ivan horvat" finds "Horvat Ivan"', () => {
      const where = whereForOrderList({ ...EMPTY, q: 'ivan horvat' })
      const or = (where.and as Record<string, unknown>[])[0].or as Record<string, unknown>[]
      expect(or[0]).toEqual({
        and: [{ buyerName: { like: 'ivan' } }, { buyerName: { like: 'horvat' } }],
      })
    })

    it('uppercases the code clause, because an order code is uppercase', () => {
      const where = whereForOrderList({ ...EMPTY, q: 'ab3k' })
      const or = (where.and as Record<string, unknown>[])[0].or as Record<string, unknown>[]
      expect(or[2]).toEqual({ code: { equals: 'AB3K' } })
    })
  })

  it('ANDs a search, a performance and a state together', () => {
    const where = whereForOrderList({
      ...EMPTY,
      q: 'ivan',
      showId: '6',
      state: 'refunded',
    })
    expect((where.and as unknown[]).length).toBe(3)
    expect(where.and).toContainEqual({ show: { equals: 6 } })
    expect(where.and).toContainEqual({ refundStatus: { equals: 'refunded' } })
  })
})
