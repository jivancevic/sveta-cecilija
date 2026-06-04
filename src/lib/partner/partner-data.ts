// Impure data layer for partner stats + reconciliation (#146). Reads the Payload
// pg pool directly and scopes EVERY query by partner_id, then hands plain arrays
// to the pure modules (partner-stats / partner-reconciliation). Thin and not
// unit-tested; the math + grouping live in the pure modules where they're tested.
//
// The tickets⋈orders join shape matches src/lib/tickets/sold-seats.ts. Shows are
// joined to build a human label (date + venue). Reconciliation buckets by sold
// date (order.created_at) in Europe/Zagreb; the SQL filters on the local-month
// boundary by converting created_at to the Zagreb zone before comparing.

import type { PoolQuery } from '../tickets/sold-seats'
import {
  buildReconciliationStatement,
  type ReconStatement,
  type ReconTicketRow,
  type TicketType,
} from './partner-reconciliation'
import {
  computeSeasonStats,
  type PartnerSeasonStats,
  type StatsTicketRow,
} from './partner-stats'

const VENUE_LABEL: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

function showLabel(date: unknown, venue: unknown): string {
  const iso = typeof date === 'string' ? date.slice(0, 10) : ''
  const venueLabel = VENUE_LABEL[String(venue)] ?? String(venue ?? '')
  return venueLabel ? `${iso} · ${venueLabel}` : iso
}

// All of a partner's ticket rows (any status), joined to their show for labels.
async function loadPartnerTicketRows(
  query: PoolQuery,
  partnerId: number,
): Promise<Array<ReconTicketRow & StatsTicketRow>> {
  const res = await query(
    `SELECT o.show_id AS show_id,
            s.date AS show_date,
            s.venue AS show_venue,
            t.type AS type,
            t.status AS status,
            t.cancel_reason AS cancel_reason,
            o.created_at AS order_created_at
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN shows s ON s.id = o.show_id
     WHERE o.partner_id = $1`,
    [partnerId],
  )
  return res.rows.map((r) => ({
    showId: String(r.show_id),
    showLabel: showLabel(r.show_date, r.show_venue),
    type: r.type as TicketType,
    status: r.status as 'active' | 'cancelled',
    cancelReason: (r.cancel_reason ?? null) as 'storno' | 'refund' | null,
    orderCreatedAt: r.order_created_at ? new Date(r.order_created_at as string).toISOString() : '',
  }))
}

/** Season stats (total active + per-show) for one partner. */
export async function getPartnerSeasonStats(
  query: PoolQuery,
  partnerId: number,
): Promise<PartnerSeasonStats> {
  const rows = await loadPartnerTicketRows(query, partnerId)
  return computeSeasonStats(rows)
}

/**
 * Monthly reconciliation statement for one partner, bucketed by sold date
 * (order.created_at) in Europe/Zagreb. `year`/`month` (month 1-12) select the
 * local-time period; the SQL converts created_at to Zagreb before comparing so
 * the month boundary is correct regardless of DST.
 */
export async function getPartnerReconciliation(
  query: PoolQuery,
  args: { partnerId: number; commissionPercent: number; year: number; month: number },
): Promise<ReconStatement> {
  const { partnerId, commissionPercent, year, month } = args
  const res = await query(
    `SELECT o.show_id AS show_id,
            s.date AS show_date,
            s.venue AS show_venue,
            t.type AS type,
            t.status AS status,
            t.cancel_reason AS cancel_reason,
            o.created_at AS order_created_at
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN shows s ON s.id = o.show_id
     WHERE o.partner_id = $1
       AND EXTRACT(YEAR  FROM (o.created_at AT TIME ZONE 'Europe/Zagreb')) = $2
       AND EXTRACT(MONTH FROM (o.created_at AT TIME ZONE 'Europe/Zagreb')) = $3`,
    [partnerId, year, month],
  )
  const rows: ReconTicketRow[] = res.rows.map((r) => ({
    showId: String(r.show_id),
    showLabel: showLabel(r.show_date, r.show_venue),
    type: r.type as TicketType,
    status: r.status as 'active' | 'cancelled',
    cancelReason: (r.cancel_reason ?? null) as 'storno' | 'refund' | null,
    orderCreatedAt: r.order_created_at ? new Date(r.order_created_at as string).toISOString() : '',
  }))
  return buildReconciliationStatement({
    partnerId: String(partnerId),
    commissionPercent,
    year,
    month,
    rows,
  })
}
