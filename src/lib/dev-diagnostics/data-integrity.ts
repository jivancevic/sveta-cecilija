// Data-integrity anomaly counts + per-collection row counts for the superadmin
// dev strip (#244). Pure + DI (PoolQuery) like the other read-side helpers, so
// it's unit-testable without Payload.
//
// All anomalies are conditions that should be impossible if the app is behaving:
//   - ordersWithoutTickets : an order that never produced a ticket row (a sale
//                            that silently dropped its seats).
//   - ticketsWithoutOrder  : a ticket whose order_id points at nothing (the FK
//                            should prevent this; the probe catches a broken DB).
//   - pastActiveShows      : a show whose date is in the past but is still
//                            status='active' (never cancelled/closed out).
//   - incompleteRefunds    : an order marked refund_status='refunded' that STILL
//                            has active tickets — the refund didn't void its
//                            seats. NOTE: the issue asked for "refunds stuck
//                            pending/failed", but enum_orders_refund_status only
//                            has 'none'|'refunded' (no pending/failed state), so
//                            this is the representable, meaningful equivalent.
import type { PoolQuery } from '../tickets/sold-seats'

export interface DataIntegrity {
  anomalies: {
    ordersWithoutTickets: number
    ticketsWithoutOrder: number
    pastActiveShows: number
    incompleteRefunds: number
  }
  rowCounts: Record<string, number>
}

// Tables we report row counts for. Raw + Payload-managed app tables a superadmin
// would want a quick pulse on. (Excludes payload_* bookkeeping tables.)
const COUNTED_TABLES = [
  'orders',
  'tickets',
  'shows',
  'partners',
  'contact_submissions',
  'posts',
  'order_lookups',
  'users',
  'marketing_optouts',
  'critical_events',
] as const

export async function getDataIntegrity(query: PoolQuery): Promise<DataIntegrity> {
  const [anomalyRes, countsRes] = await Promise.all([
    query(`
      SELECT
        (SELECT count(*) FROM orders o
           WHERE NOT EXISTS (SELECT 1 FROM tickets t WHERE t.order_id = o.id)) AS orders_without_tickets,
        (SELECT count(*) FROM tickets t
           WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = t.order_id)) AS tickets_without_order,
        (SELECT count(*) FROM shows
           WHERE status = 'active' AND date < now()) AS past_active_shows,
        (SELECT count(*) FROM orders o
           WHERE o.refund_status = 'refunded'
             AND EXISTS (SELECT 1 FROM tickets t WHERE t.order_id = o.id AND t.status = 'active')) AS incomplete_refunds
    `),
    // One round trip for every table count. Tables are a fixed allow-list (never
    // user input), so the identifiers are safe to interpolate.
    query(
      `SELECT ${COUNTED_TABLES.map((t) => `(SELECT count(*) FROM ${t}) AS ${t}`).join(', ')}`,
    ),
  ])

  const a = anomalyRes.rows[0] ?? {}
  const c = countsRes.rows[0] ?? {}

  return {
    anomalies: {
      ordersWithoutTickets: toNum(a.orders_without_tickets),
      ticketsWithoutOrder: toNum(a.tickets_without_order),
      pastActiveShows: toNum(a.past_active_shows),
      incompleteRefunds: toNum(a.incomplete_refunds),
    },
    rowCounts: Object.fromEntries(COUNTED_TABLES.map((t) => [t, toNum(c[t])])),
  }
}

// pg returns count() as a bigint string; coerce to a JS number.
function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
