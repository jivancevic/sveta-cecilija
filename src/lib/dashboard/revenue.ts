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

import { ADULT_PRICE_EUR } from '../pricing'
import {
  buildReconciliationStatement,
  type ReconTicketRow,
  type TicketType,
} from '../partner/partner-reconciliation'

const CENTS_PER_EUR = 100

// In-person door sales are recorded as a flat per-show count (shows.in_person_sold,
// see src/lib/in-person-sales.ts) with no adult/child split. We therefore value
// each in-person ticket at the €20 adult face price — the door audience is
// overwhelmingly adults, and the adult price is the conservative-upper of the two
// faces, so "Revenue collected" is never understated by this approximation.
export const IN_PERSON_PRICE_CENTS = ADULT_PRICE_EUR * CENTS_PER_EUR

export type RefundStatus = 'none' | 'pending' | 'failed' | 'refunded'

// One online order. Only fully-`refunded` orders leave the till; pending/failed
// refunds are money still in hand until they actually settle.
export interface CollectedOrderRow {
  totalCents: number
  refundStatus: RefundStatus
}

export interface RevenueCollectedInput {
  orders: CollectedOrderRow[]
  /** shows.in_person_sold summed across the season (a flat headcount). */
  inPersonCount: number
}

/** Cash actually collected: online order totals net of refunds + in-person cash. */
export function revenueCollectedCents({ orders, inPersonCount }: RevenueCollectedInput): number {
  const onlineNet = orders
    .filter((o) => o.refundStatus !== 'refunded')
    .reduce((sum, o) => sum + o.totalCents, 0)
  return onlineNet + inPersonCount * IN_PERSON_PRICE_CENTS
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
