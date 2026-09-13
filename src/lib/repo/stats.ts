// StatsRepo — the season reads behind Statistika (#508, #475).
//
// Five named questions, and deliberately not one of them about money: counts
// answer to `tickets`, `season_stats` and `finance`, and euros are Financije
// (#509, decided in #500). A `revenueCents` on this interface would be the
// first step to a euro reaching a screen that must never show one, so there
// isn't one.
//
// Every method here already had an implementation somewhere in the codebase —
// `stats-loaders.ts`'s shows read, `member/season-data.ts`'s grouped ticket
// query, `offline-sales/data.ts`'s ledger totals and `tickets/sold-seats.ts`'s
// scanned counts. The seam's job is to give them ONE caller-facing name each
// and a season to be asked about; the SQL stays verbatim in the module that
// owns it, which is the second rule of the seam.
//
// **"Gratis po članu" is NOT here**: Statistika prints Gratis's own table
// (#506), through `repo.comp.ticketsInSeason` and `tallyCompsByMember`. Two
// repos counting the same comps is exactly how two screens come to disagree
// about how many a member received.
//
// The season is a calendar year (ADR-0022). The three per-show aggregates are
// NOT season-scoped: they are keyed by show id and the caller only looks up the
// shows it asked for, which is how `member/season-data.ts` has always done it
// and why `shows.date` (a timestamptz) never has to be bucketed inside SQL.

import type { SeasonShowFacts } from '@/lib/app/stats-screen'
import type { SeasonOfflineTypes, SeasonTicketRow } from '@/lib/member/season'

export interface StatsRepo {
  /**
   * Every PUBLIC performance of one season, cancelled ones included.
   *
   * Public only, through the shared predicate rather than a hand-spelled
   * `isPublic`: a ship call has no venue and no capacity, so it would read as a
   * permanently sold-out zero-capacity row (ADR-0024). Cancelled ones stay,
   * because a statistics surface reports them; the pure layer keeps them out of
   * the season totals.
   */
  publicPerformances(season: number): Promise<SeasonShowFacts[]>

  /** Active tickets per show: the adult/child split and the three channels. */
  ticketsByShow(): Promise<Map<string, SeasonTicketRow>>

  /** Ledger seats per show (ADR-0025), door and legacy summed, with types. */
  offlineByShow(): Promise<Map<string, SeasonOfflineTypes>>

  /** Scanned ACTIVE tickets per show: people through the door, one per person. */
  scannedByShow(): Promise<Map<string, number>>

  /** The calendar year of the earliest public performance, for the picker. */
  firstSeason(): Promise<number | null>
}

export type { SeasonOfflineTypes, SeasonShowFacts, SeasonTicketRow }
