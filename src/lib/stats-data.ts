import { getPayload } from 'payload'
import config from '@payload-config'
import type { StatsInput } from './stats'
import type { ShowsFind } from './show-loaders'
import { loadStatsInput } from './stats-loaders'
import { getActiveTicketCountsByShow, getScannedTicketCountsByShow } from './tickets/sold-seats'

type PoolQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

/**
 * Season statistics input for the secretary dashboard and the member view.
 *
 * The row selection (including the public-performance predicate, ADR-0024) and
 * the row shaping live in `stats-loaders.ts`; this is the Payload wiring.
 */
export async function getStatsInput(today: Date = new Date()): Promise<StatsInput> {
  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const query: PoolQuery = (sql, params) => pool.query(sql, params)

  return loadStatsInput({
    find: ((args) => payload.find(args as never)) as ShowsFind,
    // Sold seats per show = active ticket count across all channels (the
    // online_sold column is retired); includes partner-channel tickets.
    soldByShow: () => getActiveTicketCountsByShow(query),
    // Scanned-people count per show (each scanned active ticket = 1 person).
    scannedByShow: () => getScannedTicketCountsByShow(query),
    totalRevenueCents: async () => {
      // Total revenue across non-refunded orders (cents).
      const res = await query(`
        SELECT COALESCE(SUM(total), 0)::bigint AS total
        FROM orders
        WHERE refund_status = 'none'
      `)
      return Number(res.rows[0]?.total ?? 0)
    },
    today,
  })
}
