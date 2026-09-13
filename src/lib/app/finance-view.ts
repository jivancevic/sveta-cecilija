// The pure half of Financije (#509), the money screen.
//
// Nothing here is a new definition of money. Every figure this screen prints
// already had one somewhere in the codebase, and this module ASSEMBLES them so
// that Financije and the Backoffice band it replaces can never disagree:
//
//   - collected revenue is `revenueCollectedCents` (`lib/dashboard/revenue.ts`),
//     online order totals net of REFUNDED ones plus the offline ledger's own
//     Σ(quantity × unit_price_cents) (ADR-0025), never a headcount times a face
//     value and never a SUM across a join to tickets;
//   - partner receivable is `buildReconciliationStatement`'s `netCents`, the
//     same euros the reseller's own Obračun calls "what you owe HGD";
//   - a door line's subtotal is `sumOfflineLines`, the ledger's own arithmetic.
//
// THE ONE RULE THIS SCREEN EXISTS TO HOLD (glossary *Dashboard*, ADR-0015):
// collected revenue and partner receivable are two facts, kept apart, never
// summed and never labelled profit. The society has no cost data, so a bottom
// line would be a mislabelled gross. They are separate fields here for the same
// reason they are separate tiles on the screen.
//
// A second rule, which is a privacy boundary rather than an arithmetic one: no
// type in this file carries a buyer. Financije answers "how much", never "from
// whom" (#509), and `finance-no-pii.test.ts` scans the screen for the words.
//
// Pure: no IO, no clock, no Payload. `finance-data.ts` is the wiring.

import {
  buildReconciliationStatement,
  type ReconTicketRow,
  type TicketType,
} from '@/lib/partner/partner-reconciliation'
import { revenueCollectedCents, type RefundStatus } from '@/lib/dashboard/revenue'
import {
  sumOfflineLines,
  type OfflineSaleLine,
  type OfflineSource,
  type OfflineTicketType,
} from '@/lib/offline-sales/lines'
import {
  clampStatementMonth,
  statementMonths,
  statementYears,
  type MonthKey,
  type MonthOption,
} from './statement-view'
import type { Venue } from '@/lib/venues'

/** One order of the season, reduced to the two things money cares about. */
export interface FinanceOrderRow {
  totalCents: number
  refundStatus: RefundStatus
}

/**
 * The season in euros: what came in, and what went back out.
 *
 * `collectedCents` is the headline and the two halves under it are the answer
 * to "where did it come from", so they are carried rather than recomputed by
 * the page. `refundedCents` is deliberately NOT subtracted from anything on
 * screen: it is already out of `onlineNetCents`, and showing it twice would
 * read as a second deduction.
 */
export interface SeasonMoney {
  collectedCents: number
  /** Online (and comp, at €0) order totals, minus the refunded ones. */
  onlineNetCents: number
  /** The offline ledger's own sum, door and legacy lines together. */
  offlineCents: number
  /** Orders that went back in full. A lost dispute is one of these (#380). */
  refundCount: number
  refundedCents: number
}

export function seasonMoney({
  orders,
  offlineRevenueCents,
}: {
  orders: readonly FinanceOrderRow[]
  offlineRevenueCents: number
}): SeasonMoney {
  const rows = [...orders]
  const refunded = rows.filter((o) => o.refundStatus === 'refunded')

  return {
    collectedCents: revenueCollectedCents({ orders: rows, offlineRevenueCents }),
    onlineNetCents: revenueCollectedCents({ orders: rows, offlineRevenueCents: 0 }),
    offlineCents: offlineRevenueCents,
    refundCount: refunded.length,
    refundedCents: refunded.reduce((sum, o) => sum + o.totalCents, 0),
  }
}

/** A Partners row as this screen reads it: who, and at what rate (ADR-0008). */
export interface FinancePartner {
  id: string
  name: string
  commissionPercent: number
}

/** One partner-channel ticket, with the partner it was sold under. */
export interface PartnerTicketRow {
  partnerId: string
  type: TicketType
  status: 'active' | 'cancelled'
}

/**
 * What one partner owes HGD for a period. Every field is the reconciliation
 * statement's own, renamed for nothing: the row on this screen and the CSV the
 * download hands over come from the same arithmetic.
 */
export interface PartnerReceivableRow {
  partnerId: string
  partnerName: string
  commissionPercent: number
  /** Active (billable) tickets. A cancelled one is context, never money. */
  ticketsSold: number
  cancelledCount: number
  grossCents: number
  /** The partner's own cut of the gross. */
  commissionCents: number
  /** Gross minus commission: the receivable. */
  netCents: number
}

export interface PartnerReceivable {
  /** Every partner passed in, biggest receivable first, ties by name. */
  rows: PartnerReceivableRow[]
  totalNetCents: number
}

/**
 * The receivable per partner over a set of already-scoped ticket rows (one
 * season, or one month — this function does no windowing of its own).
 *
 * Every partner in `partners` gets a row, including one that sold nothing:
 * "Marco Polo owes nothing this month" is an answer the secretary is looking
 * for, and a partner missing from the list would read as a loading bug. A
 * ticket whose partner is not in the list is dropped rather than inventing a
 * nameless row, which is what a deleted Partners record would otherwise do.
 */
export function partnerReceivable(
  partners: readonly FinancePartner[],
  tickets: readonly PartnerTicketRow[],
): PartnerReceivable {
  const byPartner = new Map<string, ReconTicketRow[]>()
  for (const partner of partners) byPartner.set(partner.id, [])
  for (const ticket of tickets) {
    byPartner.get(ticket.partnerId)?.push({
      showId: '',
      showLabel: '',
      type: ticket.type,
      status: ticket.status,
      cancelReason: ticket.status === 'cancelled' ? 'storno' : null,
      orderCreatedAt: '',
    })
  }

  const rows = partners.map((partner) => {
    const statement = buildReconciliationStatement({
      partnerId: partner.id,
      commissionPercent: partner.commissionPercent,
      year: 0,
      month: 0,
      rows: byPartner.get(partner.id) ?? [],
    })
    return {
      partnerId: partner.id,
      partnerName: partner.name,
      commissionPercent: partner.commissionPercent,
      ticketsSold: statement.totalActive,
      cancelledCount: statement.cancelledCount,
      grossCents: statement.grossCents,
      commissionCents: statement.commissionCents,
      netCents: statement.netCents,
    } satisfies PartnerReceivableRow
  })

  rows.sort((a, b) => b.netCents - a.netCents || a.partnerName.localeCompare(b.partnerName, 'hr'))

  return { rows, totalNetCents: rows.reduce((sum, r) => sum + r.netCents, 0) }
}

/**
 * One stored ledger line with the evening it belongs to (ADR-0025). This is
 * the line as it was WRITTEN: the price actually charged and, where that is
 * below face value, the label saying why.
 */
export interface LedgerLineRow {
  showId: string
  /** `YYYY-MM-DD`. */
  showDate: string
  venue: Venue
  source: OfflineSource
  ticketType: OfflineTicketType
  /** Signed: a negative line is how a miscount is corrected. */
  quantity: number
  unitPriceCents: number
  discountLabel: string | null
}

/** One evening's ledger: its lines in the order they were written, and the sum. */
export interface LedgerPerformance {
  showId: string
  date: string
  venue: Venue
  lines: LedgerLineRow[]
  /** Net seats across the lines; a correction subtracts. */
  seats: number
  /** Σ(quantity × unit price), the ledger's own arithmetic. */
  revenueCents: number
}

/**
 * The ledger grouped by evening, newest first.
 *
 * Lines keep their stored order inside an evening, so a correction reads after
 * the line it corrects and the subtotal underneath explains itself. The
 * subtotal is `sumOfflineLines`, never a seat count times a face value: the
 * whole point of the ledger is that a €15 pensioner seat is €15.
 */
export function groupLedgerByPerformance(
  rows: readonly LedgerLineRow[],
): LedgerPerformance[] {
  const byShow = new Map<string, LedgerPerformance>()

  for (const row of rows) {
    let entry = byShow.get(row.showId)
    if (!entry) {
      entry = {
        showId: row.showId,
        date: row.showDate,
        venue: row.venue,
        lines: [],
        seats: 0,
        revenueCents: 0,
      }
      byShow.set(row.showId, entry)
    }
    entry.lines.push(row)
  }

  for (const entry of byShow.values()) {
    const totals = sumOfflineLines(
      entry.lines.map(
        (line): OfflineSaleLine => ({
          ticketType: line.ticketType,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          discountLabel: line.discountLabel,
        }),
      ),
    )
    entry.seats = totals.seats
    entry.revenueCents = totals.revenueCents
  }

  return [...byShow.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || b.showId.localeCompare(a.showId),
  )
}

/** One promo code's season, as `getActiveTicketCountsByPromoCode` reports it. */
export interface PromoCodeRow {
  code: string
  /** The member the code is attributed to (ADR-0018). Never a buyer. */
  memberName: string
  ticketsSold: number
  revenueCents: number
}

export interface PromoRevenue {
  /** Codes that actually sold, biggest earner first. */
  rows: PromoCodeRow[]
  ticketsSold: number
  /** Revenue on promo orders. A SUBSET of collected revenue, never an addend. */
  totalCents: number
}

/**
 * The promo-code half of the money, which #500 gave to `finance` as a revenue
 * column in a Backoffice panel and which has had no home since.
 *
 * A promo order is an ordinary online order (ADR-0018) and its money is already
 * inside `collectedCents`; this is the "of which" line, never a third figure to
 * add. Codes that have sold nothing are dropped: the Backoffice listed every
 * code because that panel was also how a code's existence was checked, and this
 * screen is about euros.
 */
export function promoRevenue(rows: readonly PromoCodeRow[]): PromoRevenue {
  const used = rows
    .filter((r) => r.ticketsSold > 0 || r.revenueCents !== 0)
    .sort((a, b) => b.revenueCents - a.revenueCents || a.code.localeCompare(b.code, 'hr'))

  return {
    rows: used,
    ticketsSold: used.reduce((sum, r) => sum + r.ticketsSold, 0),
    totalCents: used.reduce((sum, r) => sum + r.revenueCents, 0),
  }
}

/**
 * Which month the receivable panel is showing, from the query string.
 *
 * The bounds are Obračun's (#505) and this reuses them rather than restating
 * them: the picker reaches back `statementYears` seasons and stops at the
 * current Europe/Zagreb month, because a statement for a month that has not
 * happened is an empty CSV that looks like a bug. Anything unparseable,
 * out of range or older than the picker offers falls back to today's month
 * rather than erroring: a mistyped address should show this month.
 */
export function resolveReceivableMonth(
  now: MonthKey,
  rawYear: string | undefined,
  rawMonth: string | undefined,
): MonthKey {
  const years = statementYears(now)
  const parsedYear = Number(rawYear)
  const year = years.includes(parsedYear) ? parsedYear : now.year

  const parsedMonth = Number(rawMonth)
  const month = Number.isInteger(parsedMonth)
    ? clampStatementMonth(now, year, parsedMonth)
    : year === now.year
      ? now.month
      : 12

  return { year, month }
}

export type { MonthKey, MonthOption, OfflineSource, OfflineTicketType, RefundStatus }
export type { TicketType, Venue, OfflineSaleLine, ReconTicketRow }
export { clampStatementMonth, statementMonths, statementYears }
