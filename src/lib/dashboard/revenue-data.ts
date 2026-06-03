// Impure data layer feeding the dashboard money model (#237). Reads the Payload
// pg pool and hands plain rows to the pure functions in ./revenue.ts, which hold
// all the arithmetic and are unit-tested without a DB.

import type { PoolQuery } from '../tickets/sold-seats'
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
  const [orderRes, inPersonRes, partnerRes] = await Promise.all([
    // Online orders: total + refund status (the pure fn drops only 'refunded').
    query(`SELECT total, refund_status FROM orders`),
    // In-person cash: a flat per-show headcount summed across the season.
    query(`SELECT COALESCE(SUM(in_person_sold), 0)::bigint AS count FROM shows`),
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

  const inPersonCount = Number(inPersonRes.rows[0]?.count ?? 0)

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
    revenueCollectedCents: revenueCollectedCents({ orders, inPersonCount }),
    partnerReceivableCents: partnerReceivableCents([...byPartner.values()]),
  }
}
