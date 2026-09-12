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

export interface LookupAuditEntry {
  userId: string | number
  showId: string | number
  mode: LookupMode
  query: string
  matchedOrderIds: string[]
}

export interface OrdersRepo {
  /** Buyer, party and show of one order, or null when it is gone. */
  detailsById(id: string | number): Promise<OrderDetails | null>
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
