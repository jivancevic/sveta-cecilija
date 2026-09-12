// ShowsRepo — the slice of the shows collection the seam serves today (#475).
//
// One method, because Skener needs one: the id-addressed read behind a ticket
// that already exists. The schedule itself is NOT here and must not be: reading
// the schedule goes through `getUpcomingShows()` / `getNextShow()`
// (`src/lib/shows.ts`), which is a CLAUDE.md hard rule and the place the
// public-performance predicate is applied.
//
// The projection is the one `scan-token.ts` already declares, so the seam
// returns a domain row and never a Payload document.

import type { ShowDetails } from '@/lib/scan-token'

/** One entry of Narudžbe's performance filter (#501). */
export interface TicketedPerformance {
  id: string
  /** YYYY-MM-DD. */
  date: string
  time: string
  /** The DB slug; `VENUE_LABEL` turns it into a name people say. */
  venue: string
}

export interface ShowsRepo {
  /**
   * Date / time / venue of one performance, or null when the row is gone.
   *
   * Order-joined by every caller today: the id comes off a ticket's order, so a
   * non-public performance (which sells nothing) cannot surface here.
   */
  detailsById(id: string | number): Promise<ShowDetails | null>
  /**
   * Every performance that sells tickets, newest first (#501).
   *
   * Only the ticketed ones, because this fills a filter over ORDERS and a
   * non-public performance has none (ADR-0024). The predicate comes from
   * `show-performance.ts` rather than being spelled here, which is the rule.
   * Not the buyer's schedule: that is `getUpcomingShows()` and it ends today.
   */
  ticketedPerformances(): Promise<TicketedPerformance[]>
}

export type { ShowDetails }
