// Per-show ticket counts, derived from `tickets` rows (ADR-0007/0008), not the
// retired `shows.online_sold` counter. This is the single seam for both counts:
//   - active  = occupied seats (one active ticket = one seat; cancelled tickets
//               free their seat automatically)
//   - scanned = people through the door (one scanned active ticket = one person)
// Defining the SQL once here keeps the "what counts as a sold/scanned seat"
// filter (status='active', scanned=true) from drifting across the stats and
// shows data layers, which previously hand-wrote it.
//
// These helpers take a pool-query function so they're unit-testable without a
// live DB; the data layer wires the real Payload pg pool.

export type PoolQuery = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>

/**
 * Active ticket count per show, keyed by stringified show id. Shows with no
 * tickets are simply absent from the map (callers default to 0).
 */
export async function getActiveTicketCountsByShow(query: PoolQuery): Promise<Map<string, number>> {
  const res = await query(`
    SELECT o.show_id AS show_id, COUNT(*)::int AS sold
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    WHERE t.status = 'active'
    GROUP BY o.show_id
  `)
  const byShow = new Map<string, number>()
  for (const row of res.rows) {
    byShow.set(String(row.show_id), Number(row.sold) || 0)
  }
  return byShow
}

/** Active ticket count for a single show. Returns 0 for a non-numeric id. */
export async function getActiveTicketCountForShow(
  query: PoolQuery,
  showId: number | string,
): Promise<number> {
  const numericId = Number(showId)
  if (!Number.isFinite(numericId)) return 0
  const res = await query(
    `SELECT COUNT(*)::int AS sold
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     WHERE o.show_id = $1 AND t.status = 'active'`,
    [numericId],
  )
  return Number(res.rows[0]?.sold ?? 0)
}

/**
 * Scanned (admitted) ticket count per show, keyed by stringified show id. Each
 * scanned active ticket is one person through the door (ADR-0007). Shows with
 * none are absent from the map (callers default to 0).
 */
export async function getScannedTicketCountsByShow(query: PoolQuery): Promise<Map<string, number>> {
  const res = await query(`
    SELECT o.show_id AS show_id, COUNT(*)::int AS scanned
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    WHERE t.scanned = true AND t.status = 'active'
    GROUP BY o.show_id
  `)
  const byShow = new Map<string, number>()
  for (const row of res.rows) {
    byShow.set(String(row.show_id), Number(row.scanned) || 0)
  }
  return byShow
}

/**
 * Active ticket counts split by order channel, across the whole season. Used by
 * the dashboard channel-mix chart (#242). Only the online/partner split lives in
 * `tickets` (in-person sales have no ticket rows — they're on shows.inPersonSold,
 * folded in by the caller). `comp` orders (goodwill giveaways, ADR-0019) also
 * have ticket rows but are NOT a sales channel and carry no revenue, so they are
 * excluded from the mix rather than folded into `online`. Any other/null value
 * (legacy rows default 'online') folds into `online`.
 */
export async function getActiveTicketCountsByChannel(
  query: PoolQuery,
): Promise<{ online: number; partner: number }> {
  const res = await query(`
    SELECT o.channel AS channel, COUNT(*)::int AS sold
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    WHERE t.status = 'active'
    GROUP BY o.channel
  `)
  let online = 0
  let partner = 0
  for (const row of res.rows) {
    const count = Number(row.sold) || 0
    const channel = String(row.channel)
    if (channel === 'partner') partner += count
    else if (channel === 'comp') continue // goodwill, not a sales channel
    else online += count
  }
  return { online, partner }
}

/**
 * One row of the promo-code reporting panel (#325, ADR-0018): per promo code,
 * the attributed member, the WHOLE-PARTY active-ticket count (adults + children
 * on any order that used the code) and the revenue kept.
 */
export type PromoCodeSalesRow = {
  promoCodeId: string
  code: string
  memberName: string
  ticketsSold: number
  revenueCents: number
}

/**
 * Active-ticket counts + revenue grouped by promo code, across the whole season.
 * The promo-code analogue of getActiveTicketCountsByChannel (#242): same
 * tickets⋈orders active-only join, grouped by the order's promo_code_id instead
 * of channel.
 *
 * "Tickets sold" is the whole party — every active ticket (adult AND child) on
 * any order that applied the code, not just the discounted adult seats — so it
 * measures the member's real draw. Cancelled/refunded tickets are excluded and
 * the number self-heals via the active-ticket count exactly like the seat model
 * (a fully-refunded order voids its tickets, dropping the count to 0). Revenue is
 * the money kept: the sum of order totals for the code's orders, excluding
 * refunded orders.
 *
 * The per-order subquery collapses each order to one row first, so joining the
 * (one-to-many) tickets does not multiply the order total. Every code is listed
 * (LEFT JOINs), including codes that have sold nothing yet, sorted by tickets
 * sold desc then code asc so the panel leads with the top draws.
 */
export async function getActiveTicketCountsByPromoCode(
  query: PoolQuery,
): Promise<PromoCodeSalesRow[]> {
  const res = await query(`
    SELECT
      pc.id AS promo_code_id,
      pc.code AS code,
      m.name AS member_name,
      COALESCE(SUM(oa.active_tickets), 0)::int AS tickets_sold,
      COALESCE(SUM(oa.revenue_cents) FILTER (WHERE oa.refund_status <> 'refunded'), 0)::bigint AS revenue_cents
    FROM promo_codes pc
    LEFT JOIN members m ON m.id = pc.member_id
    LEFT JOIN (
      SELECT o.id AS order_id,
             o.promo_code_id AS promo_code_id,
             o.total AS revenue_cents,
             o.refund_status AS refund_status,
             COUNT(t.id) FILTER (WHERE t.status = 'active') AS active_tickets
      FROM orders o
      LEFT JOIN tickets t ON t.order_id = o.id
      WHERE o.promo_code_id IS NOT NULL
      GROUP BY o.id
    ) oa ON oa.promo_code_id = pc.id
    GROUP BY pc.id, pc.code, m.name
  `)
  return res.rows
    .map((row) => ({
      promoCodeId: String(row.promo_code_id),
      code: String(row.code ?? ''),
      memberName: row.member_name == null ? '' : String(row.member_name),
      ticketsSold: Number(row.tickets_sold) || 0,
      revenueCents: Number(row.revenue_cents) || 0,
    }))
    .sort((a, b) => b.ticketsSold - a.ticketsSold || a.code.localeCompare(b.code))
}

/** Scanned ticket count for a single show. Returns 0 for a non-numeric id. */
export async function getScannedTicketCountForShow(
  query: PoolQuery,
  showId: number | string,
): Promise<number> {
  const numericId = Number(showId)
  if (!Number.isFinite(numericId)) return 0
  const res = await query(
    `SELECT COUNT(*)::int AS scanned
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     WHERE o.show_id = $1 AND t.scanned = true AND t.status = 'active'`,
    [numericId],
  )
  return Number(res.rows[0]?.scanned ?? 0)
}
