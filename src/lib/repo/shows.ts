// ShowsRepo — the slice of the shows collection the seam serves today (#475).
//
// Three jobs:
//
//   - Skener's read behind a ticket that already exists (`detailsById`).
//   - The voditelj's non-public performances (#503): the one row a form is
//     about, the create, and the patch behind Uredi / Otkaži / Pragovi.
//   - Narudžbe's performance filter (#501): the ticketed rows, and only those,
//     because the filter is over ORDERS and a non-public row has none.
//
// The schedule itself is NOT here and must not be: reading the schedule goes
// through `getUpcomingShows()` / `getNextShow()` (`src/lib/shows.ts`), which is
// a CLAUDE.md hard rule and the place the public-performance predicate is
// applied.
//
// The projections are domain rows, never Payload documents. The writes go
// through Payload's local API inside `repo/payload/shows.ts` so the collection
// hooks keep running — the roster push on a change, the kind/isPublic
// invariants, the cascade deletes. `overrideAccess: true` means FIELD access
// does not gate them, so "a voditelj may not touch a public row" is refused in
// the route (`src/lib/app/performance-form.ts`), never pretended here.

import type { ShowDetails } from '@/lib/scan-token'
import type { NewPerformanceRow, NonPublicKind } from '@/lib/performance-input'

/**
 * One performance as the voditelj's forms read it (#503).
 *
 * Deliberately narrow: what the screen prints into the Uredi fields, plus the
 * two facts every refusal is decided on (is it public, is it already
 * cancelled). Headcounts, postava and comps belong to the detail loader.
 */
export interface PerformanceRow {
  id: string
  /** `YYYY-MM-DD` — the day, never an ISO instant. */
  date: string
  /** `HH:MM`, Europe/Zagreb wall clock. */
  time: string
  kind: string
  isPublic: boolean
  cancelled: boolean
  /** Non-public rows: the free-text place. */
  location: string | null
  /** Non-public rows: the ship or the organiser. */
  client: string | null
  thresholdCrni: number
  thresholdBili: number
}

/**
 * What an update may carry.
 *
 * Spelled out as a closed shape rather than `Record<string, unknown>`: this is
 * the list of columns Cecilija's voditelj screens write, and a field that is
 * not on it (a venue, a sales counter, `isPublic`) cannot reach the collection
 * by accident.
 */
export interface PerformancePatch {
  /** A full ISO instant; Shows stores the day at noon UTC. */
  date?: string
  time?: string
  kind?: NonPublicKind
  location?: string
  client?: string | null
  status?: 'active' | 'cancelled'
  thresholdCrni?: number
  thresholdBili?: number
}

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

  /** The row one voditelj form is about, or null when the id is not a performance. */
  performanceById(id: string | number): Promise<PerformanceRow | null>

  /**
   * Create performances through the ONE shared writer
   * (`createPerformancesInBulk`), so a row added on a phone, a row pasted
   * through the MCP tool and a season entered in the Backoffice behave the
   * same: one transaction, and one announcement.
   *
   * @param actor the caller, for Payload's attribution and its hooks.
   */
  createPerformances(
    rows: readonly NewPerformanceRow[],
    actor?: unknown,
  ): Promise<{ created: string[] }>

  /**
   * Patch one performance through the collection, so the roster is told what
   * changed (`notifyRosterOnShowChange`). A raw `UPDATE` here would make an
   * edit from the phone silent while the same edit from the Backoffice rang
   * everybody.
   */
  updatePerformance(id: string | number, patch: PerformancePatch, actor?: unknown): Promise<void>
}

export type { NewPerformanceRow, NonPublicKind, ShowDetails }
