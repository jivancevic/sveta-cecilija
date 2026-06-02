// Loads a partner's sales made TODAY in Europe/Zagreb (#145) — the set still
// within the same-day storno window. Pure aside from the injected pool query, so
// it's unit-testable. The route/dashboard wires the real Payload pg pool.
//
// Scoping is fail-safe: we filter on the partner id AND `created_at::date` in the
// Zagreb timezone, so a partner only ever sees its own same-day orders. Ticket
// refs (CODE-N) are derived from issuance order (id ascending within the order),
// matching how the slips/PDF number them.

import type { PoolQuery } from '../tickets/sold-seats'

export interface TodaySaleTicket {
  id: string
  ref: string
  type: string
  status: string
}

export interface TodaySale {
  orderId: string
  code: string
  /** HH:MM Europe/Zagreb. */
  soldAt: string
  showLabel: string
  tickets: TodaySaleTicket[]
}

const VENUE_LABEL: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

export interface TodaySalesDeps {
  query: PoolQuery
  /** Resolve a show id to a human label (date · time · venue). */
  formatShowLabel?: (show: { date: string; time: string; venue: string }) => string
}

function defaultShowLabel(show: { date: string; time: string; venue: string }): string {
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
 * Today's (Europe/Zagreb) sales for a partner, newest first, each with its
 * tickets in issuance order. Empty array when the partner has no sales today.
 */
export async function getPartnerTodaySales(
  partnerId: number | string,
  deps: TodaySalesDeps,
): Promise<TodaySale[]> {
  const numericId = Number(partnerId)
  if (!Number.isFinite(numericId)) return []

  const res = await deps.query(
    `
    SELECT
      o.id            AS order_id,
      o.code          AS code,
      to_char(o.created_at AT TIME ZONE 'Europe/Zagreb', 'HH24:MI') AS sold_at,
      s.date          AS show_date,
      s.time          AS show_time,
      s.venue         AS show_venue,
      t.id            AS ticket_id,
      t.type          AS ticket_type,
      t.status        AS ticket_status
    FROM orders o
    JOIN shows s ON s.id = o.show_id
    LEFT JOIN tickets t ON t.order_id = o.id
    WHERE o.partner_id = $1
      AND (o.created_at AT TIME ZONE 'Europe/Zagreb')::date
          = (NOW() AT TIME ZONE 'Europe/Zagreb')::date
    ORDER BY o.created_at DESC, o.id DESC, t.id ASC
    `,
    [numericId],
  )

  const label = deps.formatShowLabel ?? defaultShowLabel
  const byOrder = new Map<string, TodaySale>()
  const counters = new Map<string, number>()

  for (const row of res.rows) {
    const orderId = String(row.order_id)
    const code = String(row.code)
    if (!byOrder.has(orderId)) {
      byOrder.set(orderId, {
        orderId,
        code,
        soldAt: String(row.sold_at ?? ''),
        showLabel: label({
          date: String(row.show_date ?? ''),
          time: String(row.show_time ?? ''),
          venue: String(row.show_venue ?? ''),
        }),
        tickets: [],
      })
      counters.set(orderId, 0)
    }
    if (row.ticket_id != null) {
      const n = (counters.get(orderId) ?? 0) + 1
      counters.set(orderId, n)
      byOrder.get(orderId)!.tickets.push({
        id: String(row.ticket_id),
        ref: `${code}-${n}`,
        type: String(row.ticket_type ?? ''),
        status: String(row.ticket_status ?? ''),
      })
    }
  }

  return [...byOrder.values()]
}
