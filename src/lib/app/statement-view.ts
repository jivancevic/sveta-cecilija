// The pure half of Obračun (#505), the reseller's statement screen.
//
// Two jobs, both of which were inline in the Backoffice `StatementDownload`:
//
//   - **Which months may be asked for.** The old picker offered all twelve of
//     every year, so a partner could ask for a month that has not happened and
//     get an empty CSV back. The picker now stops at the current Europe/Zagreb
//     month, and a year change pulls the selection back with it.
//   - **What the statement says from the partner's side.** The reconciliation
//     payload is written from HGD's side (`netCents` is what HGD is owed);
//     `statementSummary` renames the same integers into the two sentences a
//     partner cares about: what they keep (commission) and what they owe.
//     Nothing is recomputed, so the screen and the CSV can never disagree.
//
// The clock is injected (`now` in Europe/Zagreb, resolved by the caller), so
// none of this takes a date of its own.

import type { ReconStatement } from '@/lib/partner/partner-reconciliation'
import { monthLabel } from './strings'

/** A Europe/Zagreb year and month (1-12), as the caller resolves "today". */
export interface MonthKey {
  year: number
  month: number
}

export interface MonthOption {
  month: number
  /** "Rujan". */
  label: string
}

/** How many seasons back the picker reaches. */
const YEARS_OFFERED = 3

/** This season and the two before it, newest first. */
export function statementYears(now: MonthKey, count: number = YEARS_OFFERED): number[] {
  return Array.from({ length: count }, (_, i) => now.year - i)
}

/**
 * The months of `year` a statement can exist for: all twelve of a past year,
 * and only the months that have begun in the current one. A future year offers
 * nothing at all.
 */
export function statementMonths(now: MonthKey, year: number): MonthOption[] {
  if (year > now.year) return []
  const last = year === now.year ? now.month : 12
  return Array.from({ length: Math.max(0, last) }, (_, i) => ({
    month: i + 1,
    label: monthLabel(i + 1),
  }))
}

/** The nearest month that exists in `year`, for a selection carried over a year change. */
export function clampStatementMonth(now: MonthKey, year: number, month: number): number {
  const last = year === now.year ? now.month : 12
  return Math.min(Math.max(1, month), last)
}

/** One month's statement, in the partner's own words. */
export interface StatementSummary {
  /** Active (billable) tickets sold in the month. */
  ticketsSold: number
  /** Storno + refund, shown as context and never billed. */
  cancelledCount: number
  /** Face value of the billable tickets, EUR cents. */
  grossCents: number
  /** The partner's own cut, EUR cents. */
  commissionCents: number
  /** What the partner owes HGD: gross minus commission, EUR cents. */
  owedCents: number
  commissionPercent: number
}

export function statementSummary(statement: ReconStatement): StatementSummary {
  return {
    ticketsSold: statement.totalActive,
    cancelledCount: statement.cancelledCount,
    grossCents: statement.grossCents,
    commissionCents: statement.commissionCents,
    // HGD's `netCents` IS the partner's debt: the money they hold and hand over.
    owedCents: statement.netCents,
    commissionPercent: statement.commissionPercent,
  }
}

export type { ReconStatement }
