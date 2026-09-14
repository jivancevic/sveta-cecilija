// What Financije loads on the server (#509).
//
// The IO wiring and nothing else, in the `sales-data.ts` shape: every rule
// about what a number MEANS lives in `finance-view.ts`, and this file only asks
// the questions and hands plain rows over. It reaches the database through
// `getRepo()` (ADR-0027 decision 5) — `db.query` for the money SQL, which the
// raw-table stores already take as a `PoolQuery`, and `partners.activeList()`
// for the channel — so it imports no Payload and needs no entry in the repo
// guard's allow-list.
//
// Four rules from elsewhere are honoured here rather than restated:
//
//   - **Never SUM a money column across a join to tickets.** Every revenue
//     query below touches `orders` alone, or collapses each order to one row in
//     a subquery before anything many-to-one joins it. A join to `shows` is
//     one-to-one and safe; a join to `tickets` multiplies the total by the
//     party size (a memory rule, and a bug that has been shipped before).
//   - **Money reads the ledger, never the counters** (ADR-0025). The offline
//     half is Σ(quantity × unit_price_cents) off `offline_sales`, which is also
//     where the per-evening door listing comes from: one query, two answers,
//     so the season total and the lines under it cannot disagree.
//   - **Only a public performance sells anything** (ADR-0024), so every REVENUE
//     query carries `publicPerformanceSql`, spelled in the one place it is
//     spelled. The two partner queries are the exception and say why: a
//     receivable is a debt, and a debt does not stop existing because somebody
//     later unticked `isPublic` on the evening it was sold for.
//   - **Both partner figures bucket by SALE date, in Europe/Zagreb** (#599).
//     The month is what `/api/partner/reconciliation` computes, so the row on
//     screen and the statement behind it are the same period; the season is the
//     same query with a year window, so the season card IS the sum of the
//     twelve statements rather than a second number that resembles it. Before
//     #599 the season windowed on `shows.date` and the two could not agree.
//
// No buyer reaches this file: no `email`, no name, no order id. Financije
// answers "how much", never "from whom" (#509, `finance-no-pii.test.ts`).

import { monthKeyInZagreb } from '@/lib/partner/partner-reconciliation'
import { getRepo } from '@/lib/repo'
import { publicPerformanceSql } from '@/lib/show-performance'
import type { PoolQuery } from '@/lib/tickets/sold-seats'
import { seasonYear } from '@/lib/member/season'
import { resolveSeason, seasonOptions } from '@/lib/lineup/stats'
import type { Venue } from '@/lib/venues'
import {
  groupLedgerByPerformance,
  partnerReceivable,
  partnersInvolved,
  promoRevenue,
  resolveReceivableMonth,
  seasonMoney,
  type FinanceOrderRow,
  type FinancePartner,
  type LedgerLineRow,
  type LedgerPerformance,
  type MonthKey,
  type OfflineSource,
  type OfflineTicketType,
  type OrderChannel,
  type PartnerReceivable,
  type PartnerTicketRow,
  type PromoCodeRow,
  type PromoRevenue,
  type RefundStatus,
  type SeasonMoney,
  type TicketType,
} from './finance-view'

/** The whole screen, as one server read. */
export interface FinanceScreen {
  season: number
  /** Newest first, for the season dropdown. */
  seasons: number[]
  money: SeasonMoney
  /** The season's receivable, the figure that sits APART from the revenue. */
  seasonReceivableCents: number
  promo: PromoRevenue
  /** Which month the receivable panel is answering for. */
  month: MonthKey
  /** Today in Europe/Zagreb, so the month picker takes no clock of its own. */
  now: MonthKey
  receivable: PartnerReceivable
  /** The season's offline ledger, newest evening first. */
  ledger: LedgerPerformance[]
}

const YEAR_BOUNDS = (season: number): [string, string] => [
  `${season}-01-01T00:00:00.000Z`,
  `${season + 1}-01-01T00:00:00.000Z`,
]

/**
 * Order totals and refund state for the season, ONLINE ORDERS ONLY. `orders`
 * alone: no ticket join.
 *
 * The channel clause is not an optimisation, it is the correctness of the whole
 * screen. A partner order stores `total` at face value the moment a reseller
 * issues the seat, but that money is the reseller's until the monthly obračun,
 * so counting it as collected would put the same euros in both cards; and a
 * storno voids the tickets while leaving `total` and `refund_status` alone, so
 * a cancelled partner sale would never leave the figure. A comp order carries
 * `total = 0` and is excluded by the same clause rather than a second rule.
 * `seasonMoney` re-applies the filter, and that is where it is tested.
 */
async function seasonOrders(query: PoolQuery, season: number): Promise<FinanceOrderRow[]> {
  const [from, to] = YEAR_BOUNDS(season)
  const res = await query(
    `SELECT o.channel AS channel, o.total AS total, o.refund_status AS refund_status
     FROM orders o
     JOIN shows s ON s.id = o.show_id
     WHERE o.channel = 'online'
       AND s.date >= $1 AND s.date < $2 AND ${publicPerformanceSql('s')}`,
    [from, to],
  )
  return res.rows.map((r) => ({
    channel: ((r.channel as OrderChannel) ?? 'online') as OrderChannel,
    totalCents: Number(r.total) || 0,
    refundStatus: ((r.refund_status as RefundStatus) ?? 'none') as RefundStatus,
  }))
}

/** Every offline line of the season with the evening it belongs to (ADR-0025). */
async function seasonLedger(query: PoolQuery, season: number): Promise<LedgerLineRow[]> {
  const [from, to] = YEAR_BOUNDS(season)
  const res = await query(
    `SELECT os.show_id AS show_id, s.date AS show_date, s.venue AS venue,
            os.source AS source, os.ticket_type AS ticket_type, os.quantity AS quantity,
            os.unit_price_cents AS unit_price_cents, os.discount_label AS discount_label
     FROM offline_sales os
     JOIN shows s ON s.id = os.show_id
     WHERE s.date >= $1 AND s.date < $2 AND ${publicPerformanceSql('s')}
     ORDER BY s.date DESC, os.id ASC`,
    [from, to],
  )
  return res.rows.map((r) => ({
    showId: String(r.show_id),
    showDate: isoDate(r.show_date),
    venue: r.venue as Venue,
    source: r.source as OfflineSource,
    ticketType: r.ticket_type as OfflineTicketType,
    quantity: Number(r.quantity) || 0,
    unitPriceCents: Number(r.unit_price_cents) || 0,
    discountLabel: (r.discount_label as string | null) ?? null,
  }))
}

/**
 * Partner-channel tickets SOLD in one season, each carrying its own Partner row.
 *
 * **This is `monthPartnerTickets` with a year window, and it has to stay that
 * way** (#599). Until then the season windowed on `shows.date` while the month
 * windowed on `orders.created_at`, so a December sale for a July evening landed
 * in two different periods and the season card could not equal the sum of the
 * twelve statements the accountant had actually invoiced. The two queries now
 * differ in one clause and nothing else, which makes that equality a property
 * of the shape rather than a coincidence anyone has to re-verify.
 *
 * **No `shows` join and no `publicPerformanceSql`**, also deliberately. The
 * filter is unreachable in normal operation — `createPartnerSale` throws
 * `SHOW_NOT_PUBLIC` before a partner seat can exist on a non-public evening —
 * and the only way it could ever bite is somebody flipping `isPublic` on a show
 * a partner had already sold for. The partner still owes that money, so
 * filtering it out would understate a real receivable. The guard belongs in the
 * sell route, where it already is.
 *
 * The join to `partners` is what makes the receivable correct rather than
 * merely plausible (the same shape `dashboard/revenue-data.ts` uses): a
 * reseller deactivated in August still owes for what it sold in July, and
 * building the total from the list of partners who may still SELL would drop
 * that debt without a trace.
 */
async function seasonPartnerTickets(
  query: PoolQuery,
  season: number,
): Promise<PartnerTicketRow[]> {
  const res = await query(
    `SELECT ${PARTNER_TICKET_COLUMNS}
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN partners p ON p.id = o.partner_id
     WHERE EXTRACT(YEAR FROM (o.created_at AT TIME ZONE 'Europe/Zagreb')) = $1`,
    [season],
  )
  return res.rows.map(toPartnerTicket)
}

/**
 * Partner-channel tickets SOLD in one Europe/Zagreb month, whichever evening
 * they are for. This is the reconciliation route's own bucket (it converts
 * `created_at` to Zagreb before comparing, so the boundary is right across
 * DST), and matching it is what makes the row on screen and the CSV behind its
 * download the same statement.
 */
async function monthPartnerTickets(
  query: PoolQuery,
  { year, month }: MonthKey,
): Promise<PartnerTicketRow[]> {
  const res = await query(
    `SELECT ${PARTNER_TICKET_COLUMNS}
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN partners p ON p.id = o.partner_id
     WHERE EXTRACT(YEAR  FROM (o.created_at AT TIME ZONE 'Europe/Zagreb')) = $1
       AND EXTRACT(MONTH FROM (o.created_at AT TIME ZONE 'Europe/Zagreb')) = $2`,
    [year, month],
  )
  return res.rows.map(toPartnerTicket)
}

/**
 * One ticket plus the Partner it was sold under. The inner join to `partners`
 * replaces the old `o.partner_id IS NOT NULL`: it is the same filter and it
 * brings the name, the rate and the active flag with it.
 */
const PARTNER_TICKET_COLUMNS = `p.id AS partner_id, p.name AS partner_name,
            p.commission_percent AS commission_percent, p.active AS partner_active,
            t.type AS type, t.status AS status`

/** `Partners.active` defaults to true, so only an explicit false deactivates. */
function toPartnerTicket(r: Record<string, unknown>): PartnerTicketRow {
  const commission = Number(r.commission_percent)
  const id = String(r.partner_id)
  return {
    partnerId: id,
    type: r.type as TicketType,
    status: (r.status as 'active' | 'cancelled') ?? 'active',
    partner: {
      id,
      name: (r.partner_name as string) ?? `Partner ${id}`,
      commissionPercent: Number.isFinite(commission) ? commission : DEFAULT_COMMISSION_PERCENT,
      active: r.partner_active !== false,
    },
  }
}

/** The Partners collection's own default (ADR-0008), for a row that has none. */
const DEFAULT_COMMISSION_PERCENT = 10

/**
 * Promo-code tickets and revenue for the season (ADR-0018).
 *
 * The inner subquery collapses each order to ONE row before the outer join, so
 * the party size can never multiply the order total — the same shape
 * `getActiveTicketCountsByPromoCode` uses, with the season window added.
 */
async function seasonPromoCodes(query: PoolQuery, season: number): Promise<PromoCodeRow[]> {
  const [from, to] = YEAR_BOUNDS(season)
  const res = await query(
    `SELECT pc.code AS code,
            m.name AS member_name,
            COALESCE(SUM(oa.active_tickets), 0)::int AS tickets_sold,
            COALESCE(SUM(oa.revenue_cents) FILTER (WHERE oa.refund_status <> 'refunded'), 0)::bigint
              AS revenue_cents
     FROM promo_codes pc
     LEFT JOIN members m ON m.id = pc.member_id
     LEFT JOIN (
       SELECT o.id AS order_id,
              o.promo_code_id AS promo_code_id,
              o.total AS revenue_cents,
              o.refund_status AS refund_status,
              COUNT(t.id) FILTER (WHERE t.status = 'active') AS active_tickets
       FROM orders o
       JOIN shows s ON s.id = o.show_id
       LEFT JOIN tickets t ON t.order_id = o.id
       WHERE o.promo_code_id IS NOT NULL
         AND s.date >= $1 AND s.date < $2 AND ${publicPerformanceSql('s')}
       GROUP BY o.id
     ) oa ON oa.promo_code_id = pc.id
     GROUP BY pc.id, pc.code, m.name`,
    [from, to],
  )
  return res.rows.map((r) => ({
    code: String(r.code ?? ''),
    memberName: r.member_name == null ? '' : String(r.member_name),
    ticketsSold: Number(r.tickets_sold) || 0,
    revenueCents: Number(r.revenue_cents) || 0,
  }))
}

/** pg hands `shows.date` back as a JS Date (noon UTC) or a string; normalise. */
function isoDate(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return ''
}

export async function loadFinanceScreen(params: {
  season?: string
  year?: string
  month?: string
  now?: Date
}): Promise<FinanceScreen> {
  const repo = getRepo()
  const query = repo.db.query

  const today = params.now ?? new Date()
  const current = seasonYear(today)
  // The same lower bound Statistika's picker uses (#508): the two season
  // screens must offer the same years, or "2024" existing on one and not the
  // other reads as missing data rather than as two different pickers.
  const seasons = seasonOptions(await repo.stats.firstSeason(), current)
  const season = resolveSeason(params.season, current, seasons)

  const now = monthKeyInZagreb(today.toISOString())
  const month = resolveReceivableMonth(now, params.year, params.month)

  const [orders, ledger, seasonTickets, monthTickets, promoRows, partners] = await Promise.all([
    seasonOrders(query, season),
    seasonLedger(query, season),
    seasonPartnerTickets(query, season),
    monthPartnerTickets(query, month),
    seasonPromoCodes(query, season),
    repo.partners.activeList(),
  ])

  const performances = groupLedgerByPerformance(ledger)
  const offlineRevenueCents = performances.reduce((sum, p) => sum + p.revenueCents, 0)

  const stillSelling: FinancePartner[] = partners.map((p) => ({
    id: p.id,
    name: p.name,
    commissionPercent: p.commissionPercent,
    active: p.active,
  }))

  // The SEASON total is derived from the sales and nothing else, so a reseller
  // deactivated mid-season is still in it. The MONTH panel starts from the
  // partners who may still sell — so an active one with no sales gets a row
  // saying it owes nothing — and adds whoever the month's rows name, so a
  // deactivated partner with an unpaid month keeps its figures and its
  // statement download.
  const seasonPartners = partnersInvolved([], seasonTickets)
  const monthPartners = partnersInvolved(stillSelling, monthTickets)

  return {
    season,
    seasons,
    money: seasonMoney({ orders, offlineRevenueCents }),
    seasonReceivableCents: partnerReceivable(seasonPartners, seasonTickets).totalNetCents,
    promo: promoRevenue(promoRows),
    month,
    now,
    receivable: partnerReceivable(monthPartners, monthTickets),
    ledger: performances,
  }
}

export type { LedgerPerformance, MonthKey, PartnerReceivable, PromoRevenue, SeasonMoney }
