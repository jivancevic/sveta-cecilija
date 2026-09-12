// The Payload-backed `OrdersRepo` (#475).
//
// The `where` for the door's search is built here because "a name search is
// three `like` clauses ANDed together" is a Payload query fact, while "a name
// search needs a first and a last name" is a rule and lives in the pure
// `order-lookup.ts`. The audit write is fail-soft on purpose: the door must not
// be blocked from admitting a guest because a log row would not insert, and the
// failure is logged rather than swallowed.

import type { Where } from 'payload'
import type { LookupAuditEntry, MatchedOrder, NormalizedQuery, OrdersRepo, OrderToken } from '../orders'
import { payloadClient, type PayloadClient } from './client'

/** Ids arrive as strings off a URL or a JSON body; the columns are integers. */
function idForQuery(id: string | number): string | number {
  const n = Number(id)
  return Number.isInteger(n) && String(n) === String(id).trim() ? n : id
}

export function whereForLookup(q: NormalizedQuery, showId: string | number): Where {
  const and: Where[] = [{ show: { equals: idForQuery(showId) } }]
  if (q.mode === 'email') {
    and.push({ email: { equals: q.email } })
  } else if (q.mode === 'code') {
    and.push({ code: { equals: q.code } })
  } else {
    for (const term of q.terms) and.push({ buyerName: { like: term } })
  }
  return { and }
}

export function createOrdersRepo(load: () => Promise<PayloadClient> = payloadClient): OrdersRepo {
  return {
    async detailsById(id) {
      const payload = await load()
      try {
        const doc = await payload.findByID({ collection: 'orders', id, depth: 0 })
        return {
          buyerName: (doc.buyerName as string) ?? '',
          adultCount: (doc.adultCount as number) ?? 0,
          childCount: (doc.childCount as number) ?? 0,
          showId: String(doc.show),
          email: (doc.email as string | null) ?? null,
          code: (doc.code as string | null) ?? null,
        }
      } catch {
        return null
      }
    },

    async findForDoorLookup(q, showId) {
      const payload = await load()
      const found = await payload.find({
        collection: 'orders',
        where: whereForLookup(q, showId),
        depth: 0,
        limit: 20,
      })
      return found.docs.map<MatchedOrder>((o) => ({
        id: String(o.id),
        buyerName: o.buyerName as string,
        adultCount: (o.adultCount as number) ?? 0,
        childCount: (o.childCount as number) ?? 0,
      }))
    },

    async activeTicketsOfOrder(orderId) {
      const payload = await load()
      const tickets = await payload.find({
        collection: 'tickets',
        where: { order: { equals: idForQuery(orderId) } },
        depth: 0,
        limit: 200,
        sort: 'createdAt',
      })
      return tickets.docs
        .filter((t) => t.status !== 'cancelled')
        .map<OrderToken>((t) => ({ token: t.token as string, scanned: !!t.scanned }))
    },

    async recordLookup(entry: LookupAuditEntry) {
      const payload = await load()
      try {
        await payload.create({
          collection: 'order-lookups',
          data: {
            user: idForQuery(entry.userId) as number | string,
            show: idForQuery(entry.showId),
            query: entry.query,
            mode: entry.mode,
            matchedOrderId: entry.matchedOrderIds.join(','),
          },
        })
      } catch (err) {
        console.error('[repo/orders] lookup audit failed', err)
      }
    },
  }
}
