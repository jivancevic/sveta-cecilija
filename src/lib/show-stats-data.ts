import { getPayload } from 'payload'
import config from '@payload-config'
import type { ShowStatsInput, ShowStatsOrder, ShowStatsToken } from './show-stats'
import type { StatsShow } from './stats'
import type { Venue } from './venues'

type PoolQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

export async function getShowStatsInput(showId: string): Promise<ShowStatsInput | null> {
  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool

  const numericId = Number(showId)
  if (!Number.isFinite(numericId)) return null

  let showDoc
  try {
    showDoc = await payload.findByID({
      collection: 'shows',
      id: numericId,
      depth: 0,
    })
  } catch {
    return null
  }
  if (!showDoc) return null

  const show: StatsShow = {
    id: String(showDoc.id),
    date: new Date(showDoc.date as string).toISOString().slice(0, 10),
    time: (showDoc.time as string) ?? '',
    venue: (showDoc.venue as Venue) ?? 'ljetno-kino',
    onlineSold: 0, // active ticket count, computed from the ticket list below
    inPersonSold: Number(showDoc.inPersonSold ?? 0),
    legacyReserved: Number(showDoc.legacyReserved ?? 0),
    scannedCount: 0, // recomputed below from tokens, unused in show-stats
    status: (showDoc.status as 'active' | 'cancelled') ?? 'active',
  }

  // Pull orders for this show, plus their tickets, in two simple queries.
  const ordersRes = await pool.query(
    `SELECT id, buyer_name, email, adult_count, child_count, total, refund_status
     FROM orders WHERE show_id = $1 ORDER BY id ASC`,
    [numericId],
  )

  const orderIds = ordersRes.rows.map((r) => Number(r.id))
  let tokensByOrder = new Map<number, ShowStatsToken[]>()
  if (orderIds.length > 0) {
    const tokensRes = await pool.query(
      `SELECT order_id, token, scanned, scanned_at
       FROM tickets t WHERE order_id = ANY($1::int[]) AND status = 'active'
       ORDER BY id ASC`,
      [orderIds],
    )
    for (const r of tokensRes.rows) {
      const oid = Number(r.order_id)
      const list = tokensByOrder.get(oid) ?? []
      list.push({
        token: String(r.token),
        scanned: Boolean(r.scanned),
        scannedAt: r.scanned_at ? new Date(r.scanned_at as string).toISOString() : null,
      })
      tokensByOrder.set(oid, list)
    }
  }

  // Sold seats = active tickets (one per person). online_sold column is retired.
  show.onlineSold = [...tokensByOrder.values()].reduce((n, list) => n + list.length, 0)

  const orders: ShowStatsOrder[] = ordersRes.rows.map((r) => {
    const id = Number(r.id)
    return {
      id: String(id),
      buyerName: String(r.buyer_name ?? ''),
      email: String(r.email ?? ''),
      adultCount: Number(r.adult_count ?? 0),
      childCount: Number(r.child_count ?? 0),
      totalCents: Number(r.total ?? 0),
      refunded: String(r.refund_status ?? 'none') === 'refunded',
      tokens: tokensByOrder.get(id) ?? [],
    }
  })

  return { show, orders }
}
