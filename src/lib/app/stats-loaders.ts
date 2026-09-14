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
import { PERFORMANCE_KINDS, type PerformanceKind } from '@/lib/show-performance'
import { toAttendanceMember } from '@/lib/attendance/rules'
import { relationIdString } from '@/lib/payload-relation'
import { isDanceRole } from '@/lib/moreskant-profile'
import { initialsOf } from '@/lib/app/members-screen'
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
  /**
   * The same confirmed evenings, split by kind (#568).
   *
   * Ljestvica is two lists — the Experience and everything else — and each one
   * is "out of" its own kinds: a dancer in every Experience of the season has a
   * puna sezona of Experiences even if they danced no Redovna.
   */
  confirmedByKind: Record<PerformanceKind, number>
  /**
   * `memberId` → the dancer's primary role, for the mark beside their name
   * (#568). The ARMY is a profile fact and may be read from a profile; a
   * *titula* is not (CONTEXT.md → *Title*), which is why this map carries the
   * role and nothing derived from an evening.
   */
  primaryRoles: Record<string, string | null>
  /**
   * `memberId` → two letters of the dancer's real name, for the disc (#607).
   *
   * The INITIALS and not the name: the mark on Ljestvica has no title to draw,
   * so without them every disc is a blank colour swatch, and the nickname
   * printed beside it does not say who Cici is. Two letters answer that and
   * carry nothing else, which keeps this payload what its neighbour's comment
   * says it is — a leaderboard rather than a directory. The name itself reaches
   * a dancer on the season profile (#608), not here.
   */
  initials: Record<string, string>
  /**
   * The same season ranked as it stood BEFORE its most recent confirmed
   * evening, so the board can say how far the reader moved on it (#607).
   *
   * Derived rather than stored: a voditelj may still edit a lineup after the
   * fact, and a snapshot taken the night of would drift away from the season it
   * claims to describe. Identical to `rows` when the season has no confirmed
   * evening yet, which makes the movement null rather than a number about
   * nothing.
   */
  rowsBeforeLast: DancerStats[]
}

/** A Payload shows doc → the fact the aggregation needs about an evening. */
export function toStatsPerformance(doc: Record<string, unknown>): StatsPerformance {
  return {
    id: String(doc.id),
    kind: (doc.kind as PerformanceKind) ?? 'redovna',
    confirmed: doc.lineupConfirmed === true,
  }
}

/**
 * The id of the season's most recent confirmed evening, by DATE (#607).
 *
 * By date rather than by the order the query returned, and by date rather than
 * by "the newest row to be confirmed": the sentence the board prints is "nakon
 * zadnje moreške", which is about an evening that was danced, not about the
 * moment a voditelj got round to ticking it off.
 *
 * Ties break on the id, so two evenings on one day still pick one and pick the
 * same one on every render.
 */
export function lastConfirmedPerformanceId(
  docs: readonly Record<string, unknown>[],
): string | null {
  let best: { id: string; date: string } | null = null
  for (const doc of docs) {
    if (doc.lineupConfirmed !== true) continue
    const id = String(doc.id)
    const date = toIsoDate(doc.date)
    if (!best || date > best.date || (date === best.date && id > best.id)) best = { id, date }
  }
  return best?.id ?? null
}

/** A Payload lineups doc → the flat row the aggregation counts. */
export function toStatsLineupRow(doc: Record<string, unknown>): StatsLineupRow | null {
  const performanceId = relationIdString(doc.performance)
  const memberId = relationIdString(doc.member)
  if (!performanceId || !memberId) return null
  // A `voditelj` line is not a dance role, so it falls out here: running an
  // Experience is not dancing it, and the scoreboard counts dancing.
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
 * `requested` is the raw `?season=` value. An unparseable or unknown year falls
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

  // A CANCELLED EVENING IS NOT AN EVENING. It never happened, so it is neither
  // in the season total nor in anybody's count, whatever its lineup says
  // (glossary: *Ljestvica*, *Statistika*). `my-season-loaders.ts` has applied
  // that rule since #457 and this half did not, which is how one dancer's
  // season could read 18 on the board and 17 on the panel beside it (#568).
  const performanceDocs = (await deps.loadPerformances(season)).filter(
    (doc) => doc.status !== 'cancelled',
  )
  const performances = performanceDocs.map(toStatsPerformance)
  const confirmedIds = performances.filter((p) => p.confirmed).map((p) => p.id)

  // No confirmed evening means no query at all: an empty `in` list would ask
  // the database for every lineup ever written.
  const lineupDocs = confirmedIds.length > 0 ? await deps.loadLineups(confirmedIds) : []
  const lineups = lineupDocs
    .map(toStatsLineupRow)
    .filter((r): r is StatsLineupRow => r !== null)

  const roster = (await deps.loadMoreskanti()).map(toAttendanceMember)

  // The kind vocabulary is `show-performance.ts`'s, never re-typed: a kind that
  // is not in the enum folds into `ostalo` here exactly as it does in the
  // aggregation, so the two halves of one season agree about what an evening was.
  const confirmedByKind = Object.fromEntries(PERFORMANCE_KINDS.map((k) => [k, 0])) as Record<
    PerformanceKind,
    number
  >
  for (const p of performances) {
    if (!p.confirmed) continue
    const kind = (PERFORMANCE_KINDS as readonly string[]).includes(p.kind) ? p.kind : 'ostalo'
    confirmedByKind[kind as PerformanceKind] += 1
  }

  // The one profile fact the board reads. Never the mobile or the e-mail: this
  // payload is rendered to every moreškant on the roster, and the PII boundary
  // (ADR-0024) is what keeps it a leaderboard rather than a directory.
  const primaryRoles: Record<string, string | null> = {}
  const initials: Record<string, string> = {}
  for (const member of roster) {
    primaryRoles[String(member.id)] = member.primaryRole ?? null
    // The name when there is one, the nickname when there is not: two letters
    // of a nickname identify nobody, but a blank disc identifies less.
    const source = member.name?.trim() || member.nickname?.trim() || ''
    initials[String(member.id)] = source === '' ? '' : initialsOf(source)
  }

  // The season again, one evening short. Cheap: the rows are already in memory,
  // so this is a second pass over the same lineups rather than a second query.
  const lastId = lastConfirmedPerformanceId(performanceDocs)
  const rowsBeforeLast =
    lastId === null
      ? aggregateDancerStats({ performances, lineups, roster })
      : aggregateDancerStats({
          performances: performances.filter((p) => p.id !== lastId),
          lineups,
          roster,
        })

  return {
    season,
    seasons,
    rows: aggregateDancerStats({ performances, lineups, roster }),
    rowsBeforeLast,
    confirmedPerformances: confirmedIds.length,
    confirmedByKind,
    primaryRoles,
    initials,
  }
}

/** The calendar year of a raw shows date, for the dropdown's lower bound. */
export function seasonOfDate(value: unknown): number | null {
  const iso = toIsoDate(value)
  const year = Number(iso.slice(0, 4))
  return Number.isInteger(year) && year > 1900 ? year : null
}
