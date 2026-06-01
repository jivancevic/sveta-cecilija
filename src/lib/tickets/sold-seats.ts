// Sold seats are derived from active ticket rows (ADR-0007/0008), not the
// retired `shows.online_sold` counter. One active ticket = one occupied seat.
// Cancelled tickets (storno/refund) free their seat automatically.
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
