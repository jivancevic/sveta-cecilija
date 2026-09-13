// What Statistika loads (#508).
//
// The DI'd half, in the `detail-loaders.ts` / `stats-loaders.ts` shape: it
// decides WHICH rows the screen sees and in what order they are asked for, with
// the repository passed in. Every rule about what a number MEANS lives in the
// pure `stats-screen.ts`; every SQL statement lives in the module that has
// always owned it, behind `StatsRepo`. `stats-screen-data.ts` is the three-line
// wiring that hands this the real `getRepo().stats` (ADR-0027 decision 5), so
// nothing here imports Payload and a test needs no database.
//
// The season picker is `/app/leaderboard`'s, down to the two helpers: an
// unparseable or unknown `?season=` falls back to the current year rather than
// erroring, because a mistyped URL should show this season's numbers and not a
// stack trace.

import { resolveSeason, seasonOptions } from '@/lib/lineup/stats'
import { seasonYear } from '@/lib/member/season'
import type { StatsRepo } from '@/lib/repo/stats'
import { buildStatsScreen, type StatsScreen } from './stats-screen'

export interface StatsScreenAccess {
  /** The viewer unlocks Izvedbe, so a row may link into it. */
  canOpenPerformances: boolean
  /** The viewer holds `tickets`, so "gratis po članu" is theirs to read. */
  canSeeComps: boolean
}

export interface LoadStatsOptions extends StatsScreenAccess {
  now?: () => Date
}

/** One season of Statistika, resolved from the raw `?season=` value. */
export async function loadStatsSeason(
  repo: StatsRepo,
  requested: unknown,
  options: LoadStatsOptions,
): Promise<StatsScreen> {
  const current = seasonYear(options.now?.() ?? new Date())
  const firstSeason = await repo.firstSeason()
  const seasons = seasonOptions(firstSeason, current)
  const season = resolveSeason(requested, current, seasons)

  // Five reads at once: one bounded by the season, three keyed by show id and
  // one per-member report. The three keyed ones are season-agnostic on purpose
  // (`member/season-data.ts`'s rule): `shows.date` is a timestamptz, so
  // bucketing a year inside SQL would evaluate in the session timezone, and the
  // pure layer only looks up the shows it asked for anyway.
  const [shows, tickets, offline, scanned, comps] = await Promise.all([
    repo.publicPerformances(season),
    repo.ticketsByShow(),
    repo.offlineByShow(),
    repo.scannedByShow(),
    // Not asked for at all when the viewer may not read it: a name that never
    // reaches the server's payload cannot reach a template either.
    options.canSeeComps ? repo.compsByMemberForSeason(season) : Promise.resolve([]),
  ])

  return buildStatsScreen({
    season,
    seasons,
    shows,
    tickets,
    offline,
    scanned,
    comps,
    canOpenPerformances: options.canOpenPerformances,
    canSeeComps: options.canSeeComps,
  })
}
