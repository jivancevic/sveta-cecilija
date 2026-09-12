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

// One online order. Only fully-`refunded` orders leave the till; pending/failed
// refunds are money still in hand until they actually settle.
export interface CollectedOrderRow {
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

/** Cash actually collected: online order totals net of refunds + offline sales. */
export function revenueCollectedCents({ orders, offlineRevenueCents }: RevenueCollectedInput): number {
  const onlineNet = orders
    .filter((o) => o.refundStatus !== 'refunded')
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
