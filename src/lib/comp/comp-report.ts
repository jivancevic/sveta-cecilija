// What Gratis reads back (#506, ADR-0019's "per-member reporting").
//
// Three named queries, in the `recent-sales-page.ts` shape: plain parameterised
// SQL against the pool the seam hands over, returning domain rows and nothing
// Payload-shaped. They live here rather than inside `repo/payload/` because the
// second rule of the seam is that SQL stays in the module that owns it; the
// repo is how they reach a connection.
//
// Money is NOT here and must not be. A comp is `total = 0` by construction, so
// the only thing worth counting is TICKETS — and a SUM across the join to
// tickets would multiply an order's total by its party size, a bug this project
// has already had once.

import type { PoolQuery } from '@/lib/db/pool-query'
import type { CompTicketRow } from '@/lib/app/comp-screen'

/** One comp ticket of an order, as the void list prints it. */
export interface CompTicket {
  id: string
  /** CODE-N, from issuance order: the reference printed on the slip. */
  ref: string
  type: 'adult' | 'child'
  cancelled: boolean
  /** Somebody already walked in on it; voiding it is a decision, not a tidy-up. */
  scanned: boolean
}

/** One comp order, as "Zadnji gratisi" prints it. */
export interface CompOrderRow {
  orderId: string
  code: string
  /** ISO instant the comp was issued. */
  createdAt: string
  /** The printed holder (ADR-0019), which is not the attribution. */
  buyerName: string | null
  email: string | null
  memberId: string | null
  memberName: string | null
  /** YYYY-MM-DD of the evening. */
  showDate: string
  showTime: string
  venue: string
  tickets: CompTicket[]
  /** Tickets still standing: 0 means the whole comp is already void. */
  activeCount: number
}

/** shows.date comes off the pool as a Date; both shapes reduce to YYYY-MM-DD. */
function isoDate(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function ticketType(value: unknown): 'adult' | 'child' {
  return value === 'child' ? 'child' : 'adult'
}

/**
 * Every comp ticket of one season, flat, one row per person.
 *
 * The season is the performance's calendar year (the project's one definition
 * of a season, `lib/member/season.ts`), bounded in SQL so a decade of comps
 * never crosses the wire to be filtered in memory. A comp with no member is
 * dropped: attribution is the point of the table, and a row with an empty name
 * would read as a member called nothing.
 */
export async function getCompTicketsInSeason(
  query: PoolQuery,
  season: number,
): Promise<CompTicketRow[]> {
  const res = await query(
    `
    SELECT m.id AS member_id, m.name AS member_name, t.type AS type, t.status AS status
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    JOIN shows s ON s.id = o.show_id
    LEFT JOIN members m ON m.id = o.member_id
    WHERE o.channel = 'comp'
      AND s.date >= $1
      AND s.date < $2
    `,
    [`${season}-01-01`, `${season + 1}-01-01`],
  )

  const rows: CompTicketRow[] = []
  for (const row of res.rows) {
    if (row.member_id == null) continue
    rows.push({
      memberId: String(row.member_id),
      memberName: String(row.member_name ?? ''),
      type: ticketType(row.type),
      // Anything that is not an active ticket is a seat that came back.
      cancelled: row.status !== 'active',
    })
  }
  return rows
}

/**
 * The newest comps, with their tickets, for the Poništi gratis list.
 *
 * Voided comps stay on the list rather than dropping out of it: the secretary
 * needs to see that the thing she just cancelled is cancelled, and a comp that
 * vanished when it was voided would read as a comp that was never issued.
 */
export async function getRecentComps(query: PoolQuery, limit: number): Promise<CompOrderRow[]> {
  const res = await query(
    `
    SELECT
      o.id          AS id,
      o.code        AS code,
      o.created_at  AS created_at,
      o.buyer_name  AS buyer_name,
      o.email       AS email,
      m.id          AS member_id,
      m.name        AS member_name,
      s.date        AS show_date,
      s."time"      AS show_time,
      s.venue       AS venue
    FROM orders o
    LEFT JOIN members m ON m.id = o.member_id
    LEFT JOIN shows s ON s.id = o.show_id
    WHERE o.channel = 'comp'
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT $1
    `,
    [limit],
  )

  const orders: CompOrderRow[] = res.rows.map((row) => ({
    orderId: String(row.id),
    code: String(row.code ?? ''),
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : '',
    buyerName: (row.buyer_name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    memberId: row.member_id == null ? null : String(row.member_id),
    memberName: (row.member_name as string | null) ?? null,
    showDate: isoDate(row.show_date),
    showTime: String(row.show_time ?? ''),
    venue: String(row.venue ?? ''),
    tickets: [],
    activeCount: 0,
  }))

  // An empty `IN` list would ask the database for every ticket ever written.
  if (orders.length === 0) return orders

  const tres = await query(
    `SELECT order_id, id, type, status, scanned
     FROM tickets
     WHERE order_id = ANY($1)
     ORDER BY order_id, id ASC`,
    [orders.map((o) => Number(o.orderId))],
  )

  const byOrder = new Map(orders.map((o) => [o.orderId, o]))
  for (const t of tres.rows) {
    const order = byOrder.get(String(t.order_id))
    if (!order) continue
    // CODE-N counts every ticket of the order, voided ones included, because
    // that is how the PDF numbered the slips the guest is holding.
    const n = order.tickets.length + 1
    const cancelled = t.status !== 'active'
    order.tickets.push({
      id: String(t.id),
      ref: `${order.code}-${n}`,
      type: ticketType(t.type),
      cancelled,
      scanned: t.scanned === true,
    })
    if (!cancelled) order.activeCount += 1
  }

  return orders
}

/** The calendar year of the earliest evening a comp was ever issued for. */
export async function getFirstCompSeason(query: PoolQuery): Promise<number | null> {
  const res = await query(
    `SELECT MIN(s.date) AS first
     FROM orders o
     JOIN shows s ON s.id = o.show_id
     WHERE o.channel = 'comp'`,
  )
  const first = res.rows[0]?.first
  if (first == null) return null
  const year = Number(isoDate(first).slice(0, 4))
  return Number.isInteger(year) && year > 1900 ? year : null
}
