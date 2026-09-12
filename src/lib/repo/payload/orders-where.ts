// The Narudžbe list's query, as Payload wants it (#501).
//
// Split out of `orders.ts` so it can be unit-tested: `orders.ts` reaches
// `getPayload` through `client.ts`, and a `where` builder does not need a
// database to be wrong. It is inside `repo/payload/` because a `Where` object
// is a Payload fact; the screen's own rules — what the four states mean, how
// long a search term may be — live in `lib/app/orders-query.ts`.

import type { Where } from 'payload'
import type { OrderListQuery } from '../orders'

/** Ids arrive as strings off a URL; the relationship columns are integers. */
export function idForQuery(id: string | number): string | number {
  const n = Number(id)
  return Number.isInteger(n) && String(n) === String(id).trim() ? n : id
}

/**
 * One AND of at most three clauses: the search, the performance, the state.
 *
 * The search is deliberately one OR over three columns rather than three modes
 * the user has to pick between (the door's lookup has modes because the door
 * types one thing at a time under pressure; the blagajna types whatever it has
 * on the phone in front of it). The name half ANDs the words, so "ivan horvat"
 * matches a row stored as "Horvat Ivan".
 */
export function whereForOrderList(query: OrderListQuery): Where {
  const and: Where[] = []

  if (query.q) {
    const terms = query.q.split(/\s+/).filter(Boolean)
    and.push({
      or: [
        { and: terms.map((term) => ({ buyerName: { like: term } })) },
        { email: { like: query.q } },
        { code: { equals: query.q.toUpperCase() } },
      ],
    })
  }

  if (query.showId) and.push({ show: { equals: idForQuery(query.showId) } })

  if (query.state === 'active') and.push({ refundStatus: { not_equals: 'refunded' } })
  else if (query.state === 'refunded') and.push({ refundStatus: { equals: 'refunded' } })
  else if (query.state === 'partner') and.push({ channel: { equals: 'partner' } })
  else if (query.state === 'comp') and.push({ channel: { equals: 'comp' } })

  return and.length > 0 ? { and } : {}
}
