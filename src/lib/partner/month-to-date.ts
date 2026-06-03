// Live month-to-date standing card for a partner (#241, ADR-0015). Surfaces the
// same euros the org dashboard calls "partner receivable", framed from the
// partner's side and computed LIVE — not only at month end. Three figures:
//
//   ticketsSold  = active tickets this month (net of cancelled)
//   owedCents    = "Za platiti HGD-u / you owe HGD" = (sold − cancelled) × face − commission
//   commission   = "Vaša provizija / your commission" = gross × commissionPercent
//
// This is the SAME math as the monthly reconciliation statement
// (buildReconciliationStatement) — owed is its `netCents`, commission its
// `commissionCents` — only reframed and labelled from the partner's POV. We
// reuse that module so the live card and the month-end PDF can never disagree.
//
// The month window (year, month in Europe/Zagreb) is INJECTED by the caller, so
// the pure math takes no clock and the data layer's "current month" is a single
// testable seam (`monthKeyInZagreb(now)`).

import type { PoolQuery } from '../tickets/sold-seats'
import {
  buildReconciliationStatement,
  type ReconTicketRow,
  type TicketType,
} from './partner-reconciliation'

export interface MonthToDate {
  /** Active tickets sold this month, net of cancelled. */
  ticketsSold: number
  /** Cancelled (storno/refund) tickets this month — context for the partner. */
  cancelledCount: number
  /** Sum of face value of active tickets, EUR cents. */
  grossCents: number
  /** The partner's own commission, EUR cents. */
  commissionCents: number
  /** What the partner owes HGD: gross − commission, EUR cents. */
  owedCents: number
}

const EMPTY: MonthToDate = {
  ticketsSold: 0,
  cancelledCount: 0,
  grossCents: 0,
  commissionCents: 0,
  owedCents: 0,
}

/**
 * Pure month-to-date framing from already-filtered ticket rows. `rows` must be
 * scoped to one partner and the target month; this does no DB access and no date
 * filtering, so it is trivially unit-testable.
 */
export function computeMonthToDate(
  rows: ReconTicketRow[],
  args: { commissionPercent: number },
): MonthToDate {
  const s = buildReconciliationStatement({
    partnerId: '',
    commissionPercent: args.commissionPercent,
    year: 0,
    month: 0,
    rows,
  })
  return {
    ticketsSold: s.totalActive,
    cancelledCount: s.cancelledCount,
    grossCents: s.grossCents,
    commissionCents: s.commissionCents,
    owedCents: s.netCents,
  }
}

/**
 * Month-to-date card for one partner, scoped to their id and the injected
 * (year, month) in Europe/Zagreb. EVERY query is filtered by `partner_id`, so a
 * card for partner A can never see partner B's rows. A non-numeric partner id is
 * fail-safe: an all-zero card with no query at all.
 */
export async function getPartnerMonthToDate(
  query: PoolQuery,
  args: { partnerId: number; commissionPercent: number; year: number; month: number },
): Promise<MonthToDate> {
  const { partnerId, commissionPercent, year, month } = args
  if (!Number.isFinite(partnerId)) return { ...EMPTY }

  // The card shows only totals, so we skip the shows join and per-show labels
  // the month-end statement needs — just the per-ticket facts the math reads.
  const res = await query(
    `SELECT t.type AS type,
            t.status AS status,
            t.cancel_reason AS cancel_reason
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     WHERE o.partner_id = $1
       AND EXTRACT(YEAR  FROM (o.created_at AT TIME ZONE 'Europe/Zagreb')) = $2
       AND EXTRACT(MONTH FROM (o.created_at AT TIME ZONE 'Europe/Zagreb')) = $3`,
    [partnerId, year, month],
  )
  const rows: ReconTicketRow[] = res.rows.map((r) => ({
    showId: '',
    showLabel: '',
    type: r.type as TicketType,
    status: r.status as 'active' | 'cancelled',
    cancelReason: (r.cancel_reason ?? null) as 'storno' | 'refund' | null,
    orderCreatedAt: '',
  }))
  return computeMonthToDate(rows, { commissionPercent })
}
