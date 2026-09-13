// The dashboard's two money facts, kept apart and NEVER summed (ADR-0015,
// CONTEXT.md "Money on the dashboard, never the word profit"). The system has no
// cost data, so a single bottom-line "profit" figure would be a mislabelled
// gross. We surface two honest, separately-labelled numbers instead:
//
//   - Revenue collected  — cash actually in hand: online orders NET of refunds
//                           + in-person cash at the door.
//   - Partner receivable  — what we will invoice partners month-end, reusing the
//                           reconciliation net: (active gross) − commission.
//
// Both are pure functions over plain rows (no DB), so they unit-test without a
// database. All money is integer EUR cents.

import {
  buildReconciliationStatement,
  type ReconTicketRow,
  type TicketType,
} from '../partner/partner-reconciliation'

export type RefundStatus = 'none' | 'pending' | 'failed' | 'refunded'

/** `orders.channel`. Only `online` is ever money the society has collected. */
export type OrderChannel = 'online' | 'partner' | 'comp'

// One order. Only fully-`refunded` orders leave the till; pending/failed
// refunds are money still in hand until they actually settle.
//
// `channel` is REQUIRED rather than optional (#538), and that is the whole
// point of it: a caller that forgets to read the column now fails `tsc` instead
// of quietly counting a reseller's face value as cash in hand.
export interface CollectedOrderRow {
  channel: OrderChannel
  totalCents: number
  refundStatus: RefundStatus
}

export interface RevenueCollectedInput {
  orders: CollectedOrderRow[]
  /**
   * Money taken outside the order system, summed from the offline sales ledger
   * as Σ(quantity × unit_price_cents) — door and legacy lines both (ADR-0025).
   *
   * This used to be a headcount multiplied by the flat €20 adult face price,
   * which overstated every child seat by €10 and could not represent a
   * discounted one at all. The ledger stores the price actually charged, so
   * this figure is now exact rather than an upper bound.
   */
  offlineRevenueCents: number
}

/**
 * Cash actually collected: ONLINE order totals net of refunds + offline sales.
 *
 * The channel filter is where the rule lives, for every surface that prints a
 * collected figure (#538). Three things make it necessary, and no one of them
 * is an optimisation:
 *
 *   - a **partner** order stores `total` at FACE VALUE the moment a reseller
 *     issues the seat (ADR-0008), but the society sees none of that money until
 *     the monthly obračun. Counting it here would put the same euros into
 *     collected revenue AND into the partner receivable, which is exactly the
 *     sum ADR-0015 and the *Dashboard* glossary entry forbid;
 *   - a **storno** voids the TICKETS and touches neither `total` nor
 *     `refund_status`, so a cancelled partner sale would sit in revenue for
 *     ever with nothing on the order row to betray it. A refund filter cannot
 *     see it; only dropping the channel can;
 *   - a **comp** order carries `total = 0` (ADR-0019), so it is excluded by the
 *     same clause rather than by a second rule someone has to remember.
 */
export function revenueCollectedCents({ orders, offlineRevenueCents }: RevenueCollectedInput): number {
  const onlineNet = orders
    .filter((o) => o.channel === 'online' && o.refundStatus !== 'refunded')
    .reduce((sum, o) => sum + o.totalCents, 0)
  return onlineNet + offlineRevenueCents
}

// One partner's tickets for the season; `commissionPercent` is the partner's own
// rate. Status mirrors the reconciliation model (cancelled = storno/refund).
export interface PartnerReceivableTicket {
  type: TicketType
  status: 'active' | 'cancelled'
}

export interface PartnerReceivableInput {
  commissionPercent: number
  tickets: PartnerReceivableTicket[]
}

/**
 * Season partner receivable across all partners = Σ per-partner net, where each
 * partner's net is exactly the reconciliation statement's net (active gross −
 * commission). We delegate to `buildReconciliationStatement` so the face values
 * and the round-half-up commission rule stay single-sourced with the monthly
 * statement — this is the same euros the partner dashboard calls "you owe HGD".
 */
export function partnerReceivableCents(partners: PartnerReceivableInput[]): number {
  let total = 0
  for (const partner of partners) {
    const rows: ReconTicketRow[] = partner.tickets.map((t) => ({
      showId: '',
      showLabel: '',
      type: t.type,
      status: t.status,
      cancelReason: t.status === 'cancelled' ? 'storno' : null,
      orderCreatedAt: '',
    }))
    const statement = buildReconciliationStatement({
      partnerId: '',
      commissionPercent: partner.commissionPercent,
      year: 0,
      month: 0,
      rows,
    })
    total += statement.netCents
  }
  return total
}
