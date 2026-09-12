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
  OrderChannel,
  OrderDetailRow,
  OrderListResult,
  OrderPerformance,
  OrderRow,
  OrdersRepo,
  OrderTicketRow,
  OrderToken,
} from '../orders'
import { payloadClient, type PayloadClient } from './client'
import { idForQuery, whereForOrderList } from './orders-where'

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

// ── Narudžbe's projections (#501) ──────────────────────────────────────────
//
// A Payload document is never handed upward: these three functions are where a
// row stops being Payload's and starts being the domain's. `depth: 1` populates
// the four relationships the screen names (show, partner, member, promo code),
// so one `find` answers the whole list rather than N+1 lookups per row.

type Doc = Record<string, unknown>

/** A relationship at `depth: 1` is the document; at depth 0 it is the id. */
function related(value: unknown): Doc | null {
  return value && typeof value === 'object' ? (value as Doc) : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** The `dayOnly` column comes back as a Date; the app passes days as strings. */
function performanceOf(value: unknown): OrderPerformance | null {
  const doc = related(value)
  if (!doc || doc.id == null) return null
  const raw = doc.date
  const date = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? '').slice(0, 10)
  return {
    id: String(doc.id),
    date,
    time: typeof doc.time === 'string' ? doc.time : '',
    venue: typeof doc.venue === 'string' ? doc.venue : '',
  }
}

function toOrderRow(doc: Doc): OrderRow {
  const channel = doc.channel === 'partner' || doc.channel === 'comp' ? doc.channel : 'online'
  const created = doc.createdAt
  return {
    id: String(doc.id),
    code: text(doc.code),
    buyerName: text(doc.buyerName),
    email: text(doc.email),
    adultCount: num(doc.adultCount),
    childCount: num(doc.childCount),
    totalCents: num(doc.total),
    channel: channel as OrderChannel,
    refunded: doc.refundStatus === 'refunded',
    partnerName: text(related(doc.partner)?.name),
    memberName: text(related(doc.member)?.name),
    promoCode: text(related(doc.promoCode)?.code),
    hasPayment: text(doc.stripePaymentIntentId) !== null,
    createdAt: created instanceof Date ? created.toISOString() : String(created ?? ''),
    show: performanceOf(doc.show),
  }
}

function toTicketRow(doc: Doc): OrderTicketRow {
  const reason = doc.cancelReason
  return {
    id: String(doc.id),
    type: doc.type === 'child' ? 'child' : 'adult',
    cancelled: doc.status === 'cancelled',
    cancelReason: reason === 'refund' || reason === 'storno' ? reason : null,
    scanned: doc.scanned === true,
    scannedAt:
      doc.scannedAt instanceof Date
        ? doc.scannedAt.toISOString()
        : typeof doc.scannedAt === 'string'
          ? doc.scannedAt
          : null,
  }
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
      } catch {
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

    async updateBuyer(id, buyer) {
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
