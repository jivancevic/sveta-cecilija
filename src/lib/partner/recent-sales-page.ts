// Paginated "recent sales" for a partner, newest first. Feeds the merged
// "Recent sales" UI where same-day (Europe/Zagreb) sales are still cancellable.
//
// Each page is one orders query (LIMIT pageSize+1 OFFSET to derive hasMore by
// trimming). Only the same-day rows on the page are expanded with their tickets
// in a single second query; older rows carry tickets:[] (they're out of the
// storno window, so the UI never needs their per-ticket refs). isToday is decided
// in SQL via the Europe/Zagreb date comparison, matching today-sales.ts. Ticket
// refs (CODE-N) come from issuance order (id ascending within the order), like the
// slips/PDF.
//
// Pure aside from the injected pool query, so it's unit-testable; the route wires
// the real Payload pg pool.

import type { PoolQuery } from '../tickets/sold-seats'

export interface RecentSalePageTicket {
  id: string
  ref: string
  type: string
  status: string
}

export interface RecentSalePageRow {
  orderId: string
  code: string
  /** order.created_at ISO. */
  createdAt: string
  /** HH:MM Europe/Zagreb. */
  soldAt: string
  showLabel: string
  adultCount: number
  childCount: number
  totalCents: number
  /** (created_at AT TZ Zagreb)::date == (now AT TZ Zagreb)::date. */
  isToday: boolean
  /** Only populated for isToday rows; [] for older rows. */
  tickets: RecentSalePageTicket[]
}

const VENUE_LABEL: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

// shows.date comes back from the pg pool as a JS Date (timestamp at noon UTC),
// not a string — `String(date)` would yield the full toString() and break the
// YYYY-MM-DD parse below. Normalise both shapes to an ISO calendar date.
function toIsoDate(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function showLabel(show: { date: string; time: string; venue: string }): string {
  const [y, m, d] = show.date.slice(0, 10).split('-').map(Number)
  const dt = y && m && d ? new Date(Date.UTC(y, m - 1, d)) : null
  const datePart = dt
    ? dt.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : show.date
  return `${datePart} · ${show.time} · ${VENUE_LABEL[show.venue] ?? show.venue}`
}

/**
 * One page of a partner's sales (newest first). `page` is 1-based; `pageSize`
 * rows per page. `hasMore` is computed by fetching pageSize+1 and trimming.
 */
export async function getPartnerRecentSalesPage(
  query: PoolQuery,
  partnerId: number,
  opts: { page: number; pageSize: number },
): Promise<{ sales: RecentSalePageRow[]; hasMore: boolean }> {
  if (!Number.isFinite(partnerId)) return { sales: [], hasMore: false }

  const { page, pageSize } = opts
  const limit = pageSize + 1
  const offset = (page - 1) * pageSize

  const res = await query(
    `
    SELECT
      o.id           AS order_id,
      o.code         AS code,
      o.created_at   AS created_at,
      to_char(o.created_at AT TIME ZONE 'Europe/Zagreb', 'HH24:MI') AS sold_at,
      o.adult_count  AS adult_count,
      o.child_count  AS child_count,
      o.total        AS total,
      s.date         AS show_date,
      s.time         AS show_time,
      s.venue        AS show_venue,
      ((o.created_at AT TIME ZONE 'Europe/Zagreb')::date
        = (NOW() AT TIME ZONE 'Europe/Zagreb')::date) AS is_today
    FROM orders o
    JOIN shows s ON s.id = o.show_id
    WHERE o.partner_id = $1
      AND EXISTS (SELECT 1 FROM tickets t WHERE t.order_id = o.id AND t.status = 'active')
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT $2 OFFSET $3
    `,
    [partnerId, limit, offset],
  )

  const fetched = res.rows
  const hasMore = fetched.length > pageSize
  const pageRows = hasMore ? fetched.slice(0, pageSize) : fetched

  const sales: RecentSalePageRow[] = pageRows.map((row) => ({
    orderId: String(row.order_id),
    code: String(row.code ?? ''),
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : '',
    soldAt: String(row.sold_at ?? ''),
    showLabel: showLabel({
      date: toIsoDate(row.show_date),
      time: String(row.show_time ?? ''),
      venue: String(row.show_venue ?? ''),
    }),
    adultCount: Number(row.adult_count) || 0,
    childCount: Number(row.child_count) || 0,
    totalCents: Number(row.total) || 0,
    isToday: row.is_today === true,
    tickets: [],
  }))

  // Expand only the same-day rows on this page with their tickets (one query).
  const todaySales = sales.filter((s) => s.isToday)
  if (todaySales.length > 0) {
    const orderIds = todaySales.map((s) => Number(s.orderId))
    const tres = await query(
      `SELECT order_id, id, type, status
       FROM tickets
       WHERE order_id = ANY($1)
       ORDER BY order_id, id ASC`,
      [orderIds],
    )

    const byOrder = new Map<string, RecentSalePageRow>(todaySales.map((s) => [s.orderId, s]))
    const counters = new Map<string, number>()
    for (const t of tres.rows) {
      const orderId = String(t.order_id)
      const sale = byOrder.get(orderId)
      if (!sale) continue
      const n = (counters.get(orderId) ?? 0) + 1
      counters.set(orderId, n)
      sale.tickets.push({
        id: String(t.id),
        ref: `${sale.code}-${n}`,
        type: String(t.type ?? ''),
        status: String(t.status ?? ''),
      })
    }
  }

  return { sales, hasMore }
}
