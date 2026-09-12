// The Payload-backed `OrdersRepo` (#475).
//
// The `where` for the door's search is built here because "a name search is
// three `like` clauses ANDed together" is a Payload query fact, while "a name
// search needs a first and a last name" is a rule and lives in the pure
// `order-lookup.ts`. The audit write is fail-soft on purpose: the door must not
// be blocked from admitting a guest because a log row would not insert, and the
// failure is logged rather than swallowed.

import type { Where } from 'payload'
import type {
  LookupAuditEntry,
  MatchedOrder,
  NormalizedQuery,
  OrderDetailRow,
  OrderListResult,
  OrdersRepo,
  OrderToken,
} from '../orders'
import { payloadClient, type PayloadClient } from './client'
import { idForQuery, whereForOrderList } from './orders-where'
import { isNotFound, toOrderRow, toTicketRow, type Doc } from './orders-map'

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

    async listForStaff(query): Promise<OrderListResult> {
      const payload = await load()
      const found = await payload.find({
        collection: 'orders',
        where: whereForOrderList(query),
        // Newest first, which is what "the order somebody is asking about" means
        // at a counter. `createdAt` rather than the id, because a comp issued
        // from `/app` and a Stripe purchase are written by different paths.
        sort: '-createdAt',
        depth: 1,
        limit: query.perPage,
        page: query.page,
        overrideAccess: true,
      })
      return {
        rows: found.docs.map((doc) => toOrderRow(doc as Doc)),
        total: found.totalDocs ?? found.docs.length,
      }
    },

    async staffDetailById(id): Promise<OrderDetailRow | null> {
      const payload = await load()
      let order: Doc
      try {
        order = (await payload.findByID({
          collection: 'orders',
          id,
          depth: 1,
          overrideAccess: true,
        })) as unknown as Doc
      } catch (err) {
        // ONLY not-found becomes null. A bare `catch { return null }` would
        // turn a database outage into "Ova narudžba ne postoji" — the screen
        // would calmly tell Tatjana a real order is gone, and the buyer
        // standing in front of her would be told the same. Anything that is
        // not Payload's NotFound is re-thrown and becomes a 500, which is what
        // an outage actually is.
        if (!isNotFound(err)) throw err
        return null
      }
      if (!order) return null

      // Cancelled tickets are part of the record here, unlike at the door:
      // "which of these seats did we void, and why" is the question this screen
      // exists to answer.
      const tickets = await payload.find({
        collection: 'tickets',
        where: { order: { equals: idForQuery(id) } },
        depth: 0,
        limit: 200,
        sort: 'createdAt',
        overrideAccess: true,
      })

      return {
        ...toOrderRow(order),
        tickets: tickets.docs.map((t) => toTicketRow(t as Doc)),
      }
    },

    async updateBuyer(id, buyer, ctx) {
      const payload = await load()
      await payload.update({
        collection: 'orders',
        id,
        // Widened the way the other `/app` writes are: `data` is typed from the
        // generated `payload-types.ts`, which this repo deliberately does not
        // commit. This says "a partial Orders update" rather than casting to
        // `never`, which said nothing at all.
        data: { buyerName: buyer.buyerName, email: buyer.email } as Parameters<
          typeof payload.update
        >[0]['data'],
        overrideAccess: true,
        // Carried so the Orders hooks and Payload's own attribution see who
        // made the edit, exactly as a Backoffice save is attributed.
        user: ctx.user as Parameters<typeof payload.update>[0]['user'],
      })
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
