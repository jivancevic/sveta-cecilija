// OrdersRepo — orders, their tickets and the door's lookup audit (#475).
//
// Exactly the four calls Skener makes, each already shaped by a pure module:
// `OrderDetails` is `scan-token.ts`'s, `MatchedOrder` / `OrderToken` /
// `NormalizedQuery` are `order-lookup.ts`'s. The repo returns those, never a
// Payload document, which is what makes phase B a rewrite of
// `repo/payload/orders.ts` and nothing above it.
//
// The door's PII boundary is in the data contract itself (`order-lookup.ts`):
// a matched order carries a name and a party size, never an e-mail, a total or
// a refund state. Keeping that shape here means the seam cannot widen it by
// accident.

import type { OrderDetails } from '@/lib/scan-token'
import type { LookupMode, MatchedOrder, NormalizedQuery, OrderToken } from '@/lib/order-lookup'
import type { WriteCtx } from './auth'

export interface LookupAuditEntry {
  userId: string | number
  showId: string | number
  mode: LookupMode
  query: string
  matchedOrderIds: string[]
}

// ── Narudžbe (#501) ────────────────────────────────────────────────────────
//
// The blagajna's three calls. Unlike the door's, these carry money, an e-mail
// and a refund state, because the screen behind them is for a `tickets` holder
// and that IS the screen's content. The two contracts sit in one file and never
// share a type: widening the door's `MatchedOrder` to serve a list would have
// carried a buyer's address to the gate.

export type OrderChannel = 'online' | 'partner' | 'comp'

/** The evening an order belongs to, as the list and the detail print it. */
export interface OrderPerformance {
  id: string
  /** YYYY-MM-DD. */
  date: string
  time: string
  /** The DB slug; `VENUE_LABEL` turns it into a name people say. */
  venue: string
}

/**
 * One order, as Narudžbe reads it.
 *
 * `totalCents` comes off the order row and nothing else ever computes it: a
 * SUM across a join to tickets multiplies the money by the party size (a repo
 * rule, and a bug this project has already had once).
 */
export interface OrderRow {
  id: string
  code: string | null
  buyerName: string | null
  email: string | null
  adultCount: number
  childCount: number
  totalCents: number
  channel: OrderChannel
  refunded: boolean
  /** The reseller that sold it (partner channel only). */
  partnerName: string | null
  /** The member a comp is attributed to (ADR-0019). */
  memberName: string | null
  /** The promo code an online order carried (ADR-0018). */
  promoCode: string | null
  /** Whether there is a Stripe payment behind it, which is what a refund needs. */
  hasPayment: boolean
  createdAt: string
  show: OrderPerformance | null
}

/** One ticket of an order: what it is, whether it still counts, whether it is in. */
export interface OrderTicketRow {
  id: string
  type: 'adult' | 'child'
  cancelled: boolean
  cancelReason: 'storno' | 'refund' | null
  scanned: boolean
  scannedAt: string | null
}

export interface OrderDetailRow extends OrderRow {
  tickets: OrderTicketRow[]
}

/** The filters of one view of the list; the rules live in `orders-query.ts`. */
export interface OrderListQuery {
  /** Buyer name, e-mail or order code. Empty means "no search". */
  q: string
  showId: string | null
  state: 'active' | 'refunded' | 'partner' | 'comp' | null
  /** One-based. */
  page: number
  perPage: number
}

export interface OrderListResult {
  rows: OrderRow[]
  /** Matching rows in total, so the pager knows how many pages there are. */
  total: number
}

export interface OrdersRepo {
  /** Buyer, party and show of one order, or null when it is gone. */
  detailsById(id: string | number): Promise<OrderDetails | null>
  /** One page of the blagajna's list, newest first (#501). */
  listForStaff(query: OrderListQuery): Promise<OrderListResult>
  /** One order with its tickets, or null when there is no such row (#501). */
  staffDetailById(id: string | number): Promise<OrderDetailRow | null>
  /**
   * The buyer's name and address, and nothing else (#501).
   *
   * Goes through the collection inside the seam so the Orders hooks run, and
   * carries the `WriteCtx` so Payload attributes the edit to whoever made it.
   * The rules — a name is required, a blank address is NULL, a refunded order
   * is closed — live in `lib/app/orders-buyer.ts`, never here.
   */
  updateBuyer(
    id: string | number,
    buyer: { buyerName: string; email: string | null },
    ctx: WriteCtx,
  ): Promise<void>
  /**
   * The door's manual-admit search, scoped to ONE performance.
   *
   * `showId` is not the caller's to choose freely: the route re-checks it
   * against `getNextShow()` before asking, so the door cannot probe a
   * historical evening (#245).
   */
  findForDoorLookup(query: NormalizedQuery, showId: string | number): Promise<MatchedOrder[]>
  /** The order's still-valid tickets: a cancelled ticket is not a seat. */
  activeTicketsOfOrder(orderId: string | number): Promise<OrderToken[]>
  /** The `order-lookups` audit row. Every lookup writes one, zero matches too. */
  recordLookup(entry: LookupAuditEntry): Promise<void>
}

export type { LookupMode, MatchedOrder, NormalizedQuery, OrderDetails, OrderToken }
