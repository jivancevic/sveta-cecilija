// Dependency-injected statistics loaders (#406, ADR-0024).
//
// The IO-free half of `stats-data.ts` and `show-stats-data.ts`: everything that
// decides WHICH rows a statistics surface sees and how a row is shaped, with the
// Payload/pool calls passed in. The `*-data.ts` modules are only the wiring;
// tests inject a fake `find` and assert on the rows that come back.
//
// Every statistic counts PUBLIC performances only. A non-public performance (a
// cruise-ship call, a concert) has no venue and no capacity, so letting one
// through would render as a zero-capacity, permanently sold-out row and would
// drag every average down. The predicate is the shared one from
// `show-performance.ts` — there is exactly one spelling of the rule.
import type { ShowsFind } from './show-loaders'
import { PUBLIC_PERFORMANCE_WHERE, isPublicPerformance } from './show-performance'
import type { StatsInput, StatsShow } from './stats'
import type { ShowStatsInput, ShowStatsOrder, ShowStatsToken } from './show-stats'
import type { Venue } from './venues'

export interface StatsInputDeps {
  find: ShowsFind
  /** Active ticket count per show id (the retired `online_sold` column is never read). */
  soldByShow: () => Promise<Map<string, number>>
  /** Scanned-people count per show id. */
  scannedByShow: () => Promise<Map<string, number>>
  /** Season revenue across non-refunded orders, in cents. */
  totalRevenueCents: () => Promise<number>
  today?: Date
}

/**
 * The un-windowed season input behind the secretary dashboard and the old stats
 * table: every PUBLIC performance in the table, with its live counts.
 *
 * Cancelled shows are kept — statistics report them; only the buyer path drops
 * them (see `show-loaders.ts`).
 */
export async function loadStatsInput(deps: StatsInputDeps): Promise<StatsInput> {
  const [showsResult, scannedByShow, soldByShow, totalRevenueCents] = await Promise.all([
    deps.find({
      collection: 'shows',
      where: PUBLIC_PERFORMANCE_WHERE,
      sort: 'date',
      limit: 1000,
      depth: 0,
    }),
    deps.scannedByShow(),
    deps.soldByShow(),
    deps.totalRevenueCents(),
  ])

  const shows: StatsShow[] = showsResult.docs.map((s) => {
    const id = String(s.id)
    return {
      id,
      date: new Date(s.date as string).toISOString().slice(0, 10),
      time: (s.time as string) ?? '',
      // Only public performances reach here, so `venue` is always set (the save
      // validation guarantees it).
      venue: (s.venue as Venue) ?? 'ljetno-kino',
      activeTicketCount: soldByShow.get(id) ?? 0,
      inPersonSold: Number(s.inPersonSold ?? 0),
      legacyReserved: Number(s.legacyReserved ?? 0),
      scannedCount: scannedByShow.get(id) ?? 0,
      status: (s.status as 'active' | 'cancelled') ?? 'active',
    }
  })

  return { today: deps.today ?? new Date(), shows, totalRevenueCents }
}

export interface ShowStatsInputDeps {
  /** `payload.findByID` on shows; returns null (or throws) when the row is gone. */
  findByID: (id: number) => Promise<Record<string, unknown> | null>
  ordersForShow: (id: number) => Promise<Record<string, unknown>[]>
  ticketsForOrders: (orderIds: number[]) => Promise<Record<string, unknown>[]>
}

/**
 * The single-show statistics drill-down (`/admin/stats/<id>`).
 *
 * Returns `null` — which the view turns into a not-found — for a missing id, a
 * non-numeric id, and for a NON-PUBLIC performance: a cruise-ship call has no
 * venue and no capacity, so there is no ticket statistics page to render for it.
 */
export async function loadShowStatsInput(
  deps: ShowStatsInputDeps,
  showId: string,
): Promise<ShowStatsInput | null> {
  const numericId = Number(showId)
  if (!Number.isFinite(numericId)) return null

  let showDoc: Record<string, unknown> | null
  try {
    showDoc = await deps.findByID(numericId)
  } catch {
    return null
  }
  if (!showDoc) return null
  if (!isPublicPerformance(showDoc)) return null

  const show: StatsShow = {
    id: String(showDoc.id),
    date: new Date(showDoc.date as string).toISOString().slice(0, 10),
    time: (showDoc.time as string) ?? '',
    venue: (showDoc.venue as Venue) ?? 'ljetno-kino',
    activeTicketCount: 0, // computed from the ticket list below
    inPersonSold: Number(showDoc.inPersonSold ?? 0),
    legacyReserved: Number(showDoc.legacyReserved ?? 0),
    scannedCount: 0, // recomputed below from tokens, unused in show-stats
    status: (showDoc.status as 'active' | 'cancelled') ?? 'active',
  }

  const orderRows = await deps.ordersForShow(numericId)
  const orderIds = orderRows.map((r) => Number(r.id))

  const tokensByOrder = new Map<number, ShowStatsToken[]>()
  if (orderIds.length > 0) {
    for (const r of await deps.ticketsForOrders(orderIds)) {
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
  show.activeTicketCount = [...tokensByOrder.values()].reduce((n, list) => n + list.length, 0)

  const orders: ShowStatsOrder[] = orderRows.map((r) => {
    const id = Number(r.id)
    return {
      id: String(id),
      buyerName: String(r.buyer_name ?? ''),
      email: String(r.email ?? ''),
      adultCount: Number(r.adult_count ?? 0),
      childCount: Number(r.child_count ?? 0),
      totalCents: Number(r.total ?? 0),
      refunded: String(r.refund_status ?? 'none') === 'refunded',
      channel: String(r.channel ?? 'online') as ShowStatsOrder['channel'],
      tokens: tokensByOrder.get(id) ?? [],
    }
  })

  return { show, orders }
}
