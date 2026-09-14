// Pure monthly reconciliation for a partner (ADR-0008, #146). Given the
// partner's own commission rate and a flat list of sold ticket rows for a
// (year, month), this computes the statement HGD bills against:
//
//   gross      = active tickets × face value (€20 adult / €10 child)
//   commission = round(gross × commissionPercent / 100)
//   net        = gross − commission   (HGD keeps commission, pays partner net)
//
// Money is kept in integer EUR cents throughout. The ONLY rounding is on
// commission: `Math.round(gross_cents × pct / 100)` — round half up to the
// nearest cent. Gross is an exact sum of integer face values so never rounds;
// net is the exact integer difference, so the three always reconcile
// (gross = commission + net) with no drift.
//
// Cancelled tickets (storno or refund) are excluded from gross/commission/net.
// They are surfaced only as a `cancelled` / `storno` count for the partner's
// records. Bucketing is by SOLD date (order.created_at), and the caller is
// responsible for filtering rows to the target month in Europe/Zagreb before
// calling this — see `monthKeyInZagreb` for the canonical bucket key.

import { ADULT_PRICE_EUR, CHILD_PRICE_EUR } from '../pricing'

const CENTS_PER_EUR = 100
const FACE_VALUE_CENTS: Record<TicketType, number> = {
  adult: ADULT_PRICE_EUR * CENTS_PER_EUR,
  child: CHILD_PRICE_EUR * CENTS_PER_EUR,
}

export type TicketType = 'adult' | 'child'
export type TicketStatus = 'active' | 'cancelled'
export type CancelReason = 'storno' | 'refund' | null

// One sold ticket (one person). `showLabel` is a human label resolved by the
// data layer (date + venue); reconciliation groups on `showId` and carries the
// label through for display.
export interface ReconTicketRow {
  showId: string
  showLabel: string
  /**
   * The two halves the label is BUILT from, carried separately since #599 so a
   * document can format them in its own language. `showLabel` stays the
   * ISO-first string it has always been, because it is also the sort key that
   * puts a statement's evenings in calendar order; a Croatian "17. 7. 2026."
   * sorts by day-of-month and would scramble them.
   *
   * Optional: the callers that build rows from an already-grouped shape
   * (`dashboard/revenue.ts`) have no date to hand and never render a document.
   */
  showDate?: string
  showVenue?: string
  type: TicketType
  status: TicketStatus
  cancelReason?: CancelReason
  /** order.created_at, ISO string. Used only by the caller for month bucketing. */
  orderCreatedAt: string
}

export interface ReconTypeBreakdown {
  adults: number
  children: number
}

export interface ReconShowLine {
  showId: string
  showLabel: string
  /** `YYYY-MM-DD` and the venue slug, when the caller had them. */
  showDate?: string
  showVenue?: string
  /** Active (billable) tickets on this show. */
  active: ReconTypeBreakdown
  activeCount: number
  cancelledCount: number
  grossCents: number
}

export interface ReconStatement {
  partnerId: string
  commissionPercent: number
  year: number
  month: number
  /** Per-show lines, in calendar order (see the sort below). */
  shows: ReconShowLine[]
  /** Season/month totals across all shows. */
  active: ReconTypeBreakdown
  totalActive: number
  cancelledCount: number
  /** Of the cancelled, how many were storno (partner void) vs refund. */
  stornoCount: number
  refundCount: number
  grossCents: number
  /**
   * Face value of the CANCELLED tickets, EUR cents (#599). It is never part of
   * gross, commission or net and must never be summed into one: the statement
   * prints it on a line of its own so the partner can tick a void off against
   * their own till, and the invoice the accountant issues stays net.
   */
  cancelledCents: number
  commissionCents: number
  netCents: number
}

function faceValueCents(type: TicketType): number {
  return FACE_VALUE_CENTS[type]
}

export interface BuildStatementInput {
  partnerId: string
  commissionPercent: number
  year: number
  month: number
  rows: ReconTicketRow[]
}

/**
 * Build a monthly reconciliation statement from already-filtered ticket rows.
 * `rows` must already be scoped to one partner and one (year, month) bucket;
 * this function does no DB access and no date filtering, so it is trivially
 * unit-testable. Multi-show input is grouped by `showId`.
 */
export function buildReconciliationStatement(input: BuildStatementInput): ReconStatement {
  const { partnerId, commissionPercent, year, month, rows } = input

  const byShow = new Map<string, ReconShowLine>()
  const totalActive: ReconTypeBreakdown = { adults: 0, children: 0 }
  let cancelledCount = 0
  let stornoCount = 0
  let refundCount = 0
  let grossCents = 0
  let cancelledCents = 0

  for (const row of rows) {
    let line = byShow.get(row.showId)
    if (!line) {
      line = {
        showId: row.showId,
        showLabel: row.showLabel,
        showDate: row.showDate,
        showVenue: row.showVenue,
        active: { adults: 0, children: 0 },
        activeCount: 0,
        cancelledCount: 0,
        grossCents: 0,
      }
      byShow.set(row.showId, line)
    }

    if (row.status === 'cancelled') {
      line.cancelledCount += 1
      cancelledCount += 1
      cancelledCents += faceValueCents(row.type)
      if (row.cancelReason === 'storno') stornoCount += 1
      else if (row.cancelReason === 'refund') refundCount += 1
      continue
    }

    // Active (billable) ticket.
    const cents = faceValueCents(row.type)
    line.grossCents += cents
    line.activeCount += 1
    grossCents += cents
    if (row.type === 'adult') {
      line.active.adults += 1
      totalActive.adults += 1
    } else {
      line.active.children += 1
      totalActive.children += 1
    }
  }

  const commissionCents = Math.round((grossCents * commissionPercent) / 100)
  const netCents = grossCents - commissionCents

  // Calendar order. `showLabel` opens with the ISO date when the data layer
  // built it, so comparing it IS comparing dates; `showDate` is preferred where
  // the caller carried it, because a label is a display string and may change.
  const shows = [...byShow.values()].sort(
    (a, b) =>
      (a.showDate ?? a.showLabel).localeCompare(b.showDate ?? b.showLabel) ||
      a.showId.localeCompare(b.showId),
  )

  return {
    partnerId,
    commissionPercent,
    year,
    month,
    shows,
    active: totalActive,
    totalActive: totalActive.adults + totalActive.children,
    cancelledCount,
    stornoCount,
    refundCount,
    grossCents,
    cancelledCents,
    commissionCents,
    netCents,
  }
}

/**
 * The Europe/Zagreb year+month a given instant falls in, as `{ year, month }`
 * with month 1-12. Bucketing by sold date uses this so a sale just before
 * midnight Zagreb time lands in the right local month, not UTC's.
 */
export function monthKeyInZagreb(iso: string): { year: number; month: number } {
  const d = new Date(iso)
  // en-CA yields YYYY-MM-DD; split is locale-stable.
  const local = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })
  const [year, month] = local.split('-').map(Number)
  return { year, month }
}

/** EUR cents as a plain decimal string, e.g. 4050 -> "40.50". For CSV export. */
export function centsToEur(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
