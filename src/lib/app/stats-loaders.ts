// What `/app/leaderboard` reads (#437, ADR-0024 phase 4).
//
// The phase 2 loader split: this half is pure and DI'd, `stats-data.ts` holds
// the Payload calls and nothing else. The counting rule itself is NOT here — it
// is `aggregateDancerStats` in `src/lib/lineup/stats.ts`, so the page, a future
// export and the MCP server can never disagree about what a season looks like.
//
// THE QUERY SHAPE IS A DECISION (#432/#437 spec): the loader fetches the
// season's performances once and then the lineups of the CONFIRMED ones in ONE
// query, rather than a lineup query per evening. Twenty-two Redovne plus the
// ship calls would otherwise be thirty round trips for a table a dancer opens
// on a phone.
//
// Visibility is society-wide, like the rest of `/app`: every moreškant sees the
// whole table (story 37). The caller has already established through the access
// decision that the viewer is on the roster, and the local API runs
// `overrideAccess: true`, so collection access scopes none of this.

import { seasonYear } from '@/lib/member/season'
import { toIsoDate } from '@/lib/to-iso-date'
import type { PerformanceKind } from '@/lib/show-performance'
import { toAttendanceMember } from '@/lib/attendance/rules'
import { relationIdString } from '@/lib/payload-relation'
import { isDanceRole } from '@/lib/moreskant-profile'
import {
  aggregateDancerStats,
  resolveSeason,
  seasonOptions,
  type DancerStats,
  type StatsLineupRow,
  type StatsPerformance,
} from '@/lib/lineup/stats'

export interface SeasonStats {
  season: number
  /** Newest first, for the dropdown. */
  seasons: number[]
  rows: DancerStats[]
  /** Confirmed performances in the season: what the numbers are out of. */
  confirmedPerformances: number
}

/** A Payload shows doc → the fact the aggregation needs about an evening. */
export function toStatsPerformance(doc: Record<string, unknown>): StatsPerformance {
  return {
    id: String(doc.id),
    kind: (doc.kind as PerformanceKind) ?? 'redovna',
    confirmed: doc.lineupConfirmed === true,
  }
}

/** A Payload lineups doc → the flat row the aggregation counts. */
export function toStatsLineupRow(doc: Record<string, unknown>): StatsLineupRow | null {
  const performanceId = relationIdString(doc.performance)
  const memberId = relationIdString(doc.member)
  if (!performanceId || !memberId) return null
  if (!isDanceRole(doc.role)) return null
  return { performanceId, memberId, role: doc.role }
}

export interface SeasonStatsDeps {
  /** Every performance of the given calendar year. */
  loadPerformances: (season: number) => Promise<Record<string, unknown>[]>
  /** The lineup rows of these performances, in ONE query. */
  loadLineups: (performanceIds: readonly string[]) => Promise<Record<string, unknown>[]>
  /** Every ACTIVE moreškant, login or not: a dancer with nothing is still a row. */
  loadMoreskanti: () => Promise<Record<string, unknown>[]>
  /** The calendar year of the earliest performance ever recorded, for the dropdown. */
  loadFirstSeason: () => Promise<number | null>
  now?: () => Date
}

/**
 * One season's table.
 *
 * `requested` is the raw `?sezona=` value. An unparseable or unknown year falls
 * back to the current season rather than erroring: a mistyped URL should show
 * this year's table, not a stack trace.
 */
export async function loadSeasonStats(
  requested: unknown,
  deps: SeasonStatsDeps,
): Promise<SeasonStats> {
  const now = deps.now?.() ?? new Date()
  const current = seasonYear(now)
  const firstSeason = await deps.loadFirstSeason()
  const seasons = seasonOptions(firstSeason, current)
  const season = resolveSeason(requested, current, seasons)

  const performanceDocs = await deps.loadPerformances(season)
  const performances = performanceDocs.map(toStatsPerformance)
  const confirmedIds = performances.filter((p) => p.confirmed).map((p) => p.id)

  // No confirmed evening means no query at all: an empty `in` list would ask
  // the database for every lineup ever written.
  const lineupDocs = confirmedIds.length > 0 ? await deps.loadLineups(confirmedIds) : []
  const lineups = lineupDocs
    .map(toStatsLineupRow)
    .filter((r): r is StatsLineupRow => r !== null)

  const roster = (await deps.loadMoreskanti()).map(toAttendanceMember)

  return {
    season,
    seasons,
    rows: aggregateDancerStats({ performances, lineups, roster }),
    confirmedPerformances: confirmedIds.length,
  }
}

/** The calendar year of a raw shows date, for the dropdown's lower bound. */
export function seasonOfDate(value: unknown): number | null {
  const iso = toIsoDate(value)
  const year = Number(iso.slice(0, 4))
  return Number.isInteger(year) && year > 1900 ? year : null
}
