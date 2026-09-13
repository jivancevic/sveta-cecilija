// CompRepo — the three named reads behind Gratis (#506, #475).
//
// Comps are ORDERS with `channel = 'comp'` (ADR-0019), so nothing here is a new
// table; what is new is that the screen asks three questions the orders list
// cannot answer: which comps were issued lately and what state are their
// tickets in, who received how many this season, and how far back the season
// picker reaches.
//
// There is no write. Issuing and voiding go through `/api/comp/issue` and
// `/api/comp/cancel`, which take the per-show advisory lock and the `storno`
// void primitive respectively; a second writer here would be a second way to
// spend a seat.

import type { CompTicketRow } from '@/lib/app/comp-screen'
import type { CompOrderRow } from '@/lib/comp/comp-report'

export interface CompRepo {
  /** The newest comp orders with their tickets, voided ones included. */
  recent(limit: number): Promise<CompOrderRow[]>
  /** Every comp ticket of one season, flat; the table's rule is pure. */
  ticketsInSeason(season: number): Promise<CompTicketRow[]>
  /** The calendar year of the earliest comp, for the season picker. */
  firstSeason(): Promise<number | null>
}

export type { CompOrderRow, CompTicketRow }
