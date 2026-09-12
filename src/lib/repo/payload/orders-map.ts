// A Payload document → the domain rows Narudžbe reads (#501).
//
// Split out of `orders.ts` for the same reason `orders-where.ts` is: `orders.ts`
// reaches `getPayload` through `client.ts`, and a projection does not need a
// database to be wrong. This file is the drift point of the whole screen — it
// is where a column rename, an enum value or a `dayOnly` Date quietly turns
// into the wrong number on a phone — so it is the one with a table test.
//
// A Payload document is never handed upward past here: everything above the
// seam sees `OrderRow` / `OrderTicketRow`, which is what makes phase B a
// rewrite of `repo/payload/` and nothing else. `depth: 1` populates the four
// relationships the screen names (show, partner, member, promo code), so one
// `find` answers the whole list rather than N+1 lookups per row.

import type {
  OrderChannel,
  OrderPerformance,
  OrderRow,
  OrderTicketRow,
} from '../orders'

export type Doc = Record<string, unknown>

/**
 * Payload's "no such document" against everything else.
 *
 * `findByID` throws `NotFound` for a missing row and for an id the adapter
 * cannot parse; every other throw (a closed pool, a failed query) is an
 * outage, and the difference is the difference between "this order is gone"
 * and "the database is down".
 */
export function isNotFound(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status
  if (status === 404) return true
  const name = (err as { name?: string } | null)?.name
  return name === 'NotFound' || /not found/i.test((err as Error | null)?.message ?? '')
}

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

export function toOrderRow(doc: Doc): OrderRow {
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

export function toTicketRow(doc: Doc): OrderTicketRow {
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
