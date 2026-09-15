// RosterRepo — what the Izvedbe screen reads (#502, #475).
//
// The two loads behind `/app/performances` and `/app/performances/[id]`, moved
// behind the seam when that screen was rebuilt for the blagajna — which is the
// rule the seam grows by (research 6.4): a call site migrates when ITS screen
// is rebuilt, never in a sweep. Their allow-list entries in
// `repo-guard.test.ts` named #502 and this is the ticket that retires them.
//
// What comes back are the screen's own domain shapes (`SeasonPerformances`,
// `PerformanceDetail`), not Payload documents, so phase B is a rewrite of
// `repo/payload/roster.ts` and nothing above it. The RULES that shape those
// objects stay where they already were and are still unit-tested without a
// database: `roster-loaders.ts` decides what a season looks like and
// `detail-loaders.ts` what one evening looks like; this interface only says
// which two questions may be asked.
//
// Note the deliberate asymmetry with `ShowsRepo`: the schedule a BUYER sees
// goes through `getUpcomingShows()` and applies the public predicate, while the
// roster reads EVERY performance of the season, public or not (ADR-0024),
// because a ship call is an evening a dancer has to turn up for. Two different
// questions, and that is why they are two different repos.

import type { SeasonPerformances } from '@/lib/app/roster-loaders'
import type { PerformanceDetail } from '@/lib/app/detail-loaders'

/** Who is asking, as both loaders already take it. */
export interface RosterViewer {
  /** The viewer's own Members id, when their login carries one. */
  memberId?: string | null
  /** Holds `moreska`: headcount chips, the postava draft, no answer time lock. */
  voditelj?: boolean
  /**
   * Count the two armies per evening even for a reader who is not a voditelj.
   * Moreška's hero draws the ArmyBar for a dancer (#565); Izvedbe does not ask
   * for it, so the blagajna's schedule stays two queries lighter and free of
   * headcounts it has no part in. Defaults to `voditelj`.
   */
  armyCounts?: boolean
  /**
   * Read the confirmed postave's composition ("7/9", #634). Moreška's past list
   * is the one screen that draws it, and it is one more query, so it is asked
   * for rather than always on.
   */
  lineupCounts?: boolean
}

export interface RosterRepo {
  /** Every performance of the current season, split into upcoming and past. */
  seasonPerformances(viewer: RosterViewer): Promise<SeasonPerformances>
  /** One evening in full, or null when the id is not a performance. */
  performanceDetail(id: string, viewer: RosterViewer): Promise<PerformanceDetail | null>
}

export type { PerformanceDetail, SeasonPerformances }
