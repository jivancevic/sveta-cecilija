import { getPayload } from 'payload'
import config from '@payload-config'
import type { ShowStatsInput } from './show-stats'
import { loadShowStatsInput } from './stats-loaders'

type PoolQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

/**
 * Single-show statistics drill-down input, or null when there is no ticket
 * statistics page to render (missing id, or a non-public performance).
 *
 * The row selection (including the public-performance predicate, ADR-0024) and
 * the row shaping live in `stats-loaders.ts`; this is the Payload wiring.
 */
export async function getShowStatsInput(showId: string): Promise<ShowStatsInput | null> {
  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool

  return loadShowStatsInput(
    {
      findByID: async (id) =>
        (await payload.findByID({
          collection: 'shows',
          id,
          depth: 0,
        })) as unknown as Record<string, unknown> | null,
      ordersForShow: async (id) =>
        (
          await pool.query(
            `SELECT id, buyer_name, email, adult_count, child_count, total, refund_status, channel
             FROM orders WHERE show_id = $1 ORDER BY id ASC`,
            [id],
          )
        ).rows,
      ticketsForOrders: async (orderIds) =>
        (
          await pool.query(
            `SELECT order_id, token, scanned, scanned_at
             FROM tickets t WHERE order_id = ANY($1::int[]) AND status = 'active'
             ORDER BY id ASC`,
            [orderIds],
          )
        ).rows,
    },
    showId,
  )
}
