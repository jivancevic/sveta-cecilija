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

export interface ShowsRepo {
  /**
   * Date / time / venue of one performance, or null when the row is gone.
   *
   * Order-joined by every caller today: the id comes off a ticket's order, so a
   * non-public performance (which sells nothing) cannot surface here.
   */
  detailsById(id: string | number): Promise<ShowDetails | null>
}

export type { ShowDetails }
