// Impure data layer feeding the dashboard money model (#237). Reads the Payload
// pg pool and hands plain rows to the pure functions in ./revenue.ts, which hold
// all the arithmetic and are unit-tested without a DB.

import type { PoolQuery } from '../tickets/sold-seats'
import { getSeasonOfflineTotals } from '../offline-sales/data'
import {
  revenueCollectedCents,
  partnerReceivableCents,
  type CollectedOrderRow,
  type RefundStatus,
  type PartnerReceivableInput,
} from './revenue'
import type { TicketType } from '../partner/partner-reconciliation'

export interface DashboardMoney {
  revenueCollectedCents: number
  partnerReceivableCents: number
}

/**
 * The two season money facts, computed apart and returned apart (never summed).
 * - Revenue collected: all order totals net of fully-refunded ones + in-person cash.
 * - Partner receivable: per-partner reconciliation net, aggregated across partners.
 */
export async function getDashboardMoney(query: PoolQuery): Promise<DashboardMoney> {
  // Three independent reads — fire them concurrently.
  const [orderRes, offlineTotals, partnerRes] = await Promise.all([
    // Online orders: total + refund status (the pure fn drops only 'refunded').
    query(`SELECT total, refund_status FROM orders`),
    // Money taken outside the order system: the offline sales ledger, summed as
    // Σ(quantity × unit price actually charged) rather than a headcount times a
    // flat face value (ADR-0025). Already scoped to PUBLIC performances
    // (ADR-0024, #406) — a non-public performance has no venue, no capacity and
    // no door, so it can never contribute cash.
    getSeasonOfflineTotals(query),
    // Partner receivable: every partner-channel ticket with its partner's rate.
    query(
      `SELECT p.id AS partner_id,
              p.commission_percent AS commission_percent,
              t.type AS type,
              t.status AS status
       FROM tickets t
       JOIN orders o ON o.id = t.order_id
       JOIN partners p ON p.id = o.partner_id`,
    ),
  ])

  const orders: CollectedOrderRow[] = orderRes.rows.map((r) => ({
    totalCents: Number(r.total) || 0,
    refundStatus: (r.refund_status as RefundStatus) ?? 'none',
  }))

  // Door and legacy money are both cash collected, so both belong in the one
  // "Revenue collected" figure; the ledger keeps them separable for display.
  const offlineRevenueCents = offlineTotals.door.revenueCents + offlineTotals.legacy.revenueCents

  const byPartner = new Map<string, PartnerReceivableInput>()
  for (const r of partnerRes.rows) {
    const id = String(r.partner_id)
    let entry = byPartner.get(id)
    if (!entry) {
      entry = { commissionPercent: Number(r.commission_percent) || 0, tickets: [] }
      byPartner.set(id, entry)
    }
    entry.tickets.push({
      type: r.type as TicketType,
      status: (r.status as 'active' | 'cancelled') ?? 'active',
    })
  }

  return {
    revenueCollectedCents: revenueCollectedCents({ orders, offlineRevenueCents }),
    partnerReceivableCents: partnerReceivableCents([...byPartner.values()]),
  }
}
