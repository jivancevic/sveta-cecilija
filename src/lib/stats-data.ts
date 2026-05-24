import { getPayload } from 'payload'
import config from '@payload-config'
import type { StatsInput, StatsShow } from './stats'
import type { Venue } from './venues'

type PoolQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

export async function getStatsInput(today: Date = new Date()): Promise<StatsInput> {
  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool

  const showsResult = await payload.find({
    collection: 'shows',
    sort: 'date',
    limit: 1000,
    depth: 0,
  })

  // Scanned-ticket count per show. qr_tokens.order_id → orders.id; orders.show_id → shows.id.
  const scannedRes = await pool.query(`
    SELECT o.show_id AS show_id, COUNT(*)::int AS scanned
    FROM qr_tokens q
    JOIN orders o ON o.id = q.order_id
    WHERE q.scanned = true
    GROUP BY o.show_id
  `)
  const scannedByShow = new Map<string, number>()
  for (const row of scannedRes.rows) {
    scannedByShow.set(String(row.show_id), Number(row.scanned) || 0)
  }

  // Total revenue across non-refunded orders (cents).
  const revenueRes = await pool.query(`
    SELECT COALESCE(SUM(total), 0)::bigint AS total
    FROM orders
    WHERE refund_status = 'none'
  `)
  const totalRevenueCents = Number(revenueRes.rows[0]?.total ?? 0)

  const shows: StatsShow[] = showsResult.docs.map((s) => {
    const id = String(s.id)
    return {
      id,
      date: new Date(s.date as string).toISOString().slice(0, 10),
      time: (s.time as string) ?? '',
      venue: (s.venue as Venue) ?? 'ljetno-kino',
      onlineSold: Number(s.onlineSold ?? 0),
      inPersonSold: Number(s.inPersonSold ?? 0),
      scannedCount: scannedByShow.get(id) ?? 0,
      status: (s.status as 'active' | 'cancelled') ?? 'active',
    }
  })

  return { today, shows, totalRevenueCents }
}
