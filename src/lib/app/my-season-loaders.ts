// What `/app/leaderboard` reads (#457): one dancer's own season.
//
// The phase 2 loader split, the same shape as `stats-loaders.ts`: this half is
// pure and DI'd, `my-season-data.ts` holds the Payload calls and nothing else.
//
// Two rules carry the page, and they are the SAME two the scoreboard follows,
// deliberately — a dancer comparing the two screens must never find two numbers
// for one season:
//
//   - ONLY CONFIRMED LINEUPS COUNT. A draft is a half-typed list, so it counts
//     for nobody, and the filter is on the PERFORMANCE (`confirmed`), because
//     confirmation is one flag per evening (#432).
//   - A CANCELLED EVENING IS NOT AN EVENING. It never happened, so it is neither
//     in the season total nor in anybody's count, whatever its lineup says.
//
// The season vocabulary (`seasonOptions`, `resolveSeason`) is `lib/lineup/stats`'s
// and is never re-derived here, so `?sezona=` means the same thing on both tabs.

import { seasonYear } from '@/lib/member/season'
import { ARMY_OF_ROLE, DANCE_ROLES, isDanceRole, type DanceRole } from '@/lib/moreskant-profile'
import { relationIdString } from '@/lib/payload-relation'
import { resolveSeason, seasonOptions } from '@/lib/lineup/stats'
import { toIsoDate } from '@/lib/to-iso-date'
import { shortMonthLabel } from '@/lib/app/strings'

/** One performance of the season, flattened to what the aggregation needs. */
export interface MySeasonPerformance {
  id: string
  /** YYYY-MM-DD; the month is read off it. */
  date: string
  confirmed: boolean
  cancelled: boolean
}

/** One lineup row, flattened to ids. */
export interface MySeasonLineupRow {
  performanceId: string
  memberId: string
  role: DanceRole
}

/** One bar of the chart: how many of that month's confirmed evenings were mine. */
export interface MySeasonMonth {
  /** 1-12. */
  month: number
  /** "ruj": short, because twelve of these share one axis. */
  label: string
  total: number
  mine: number
}

export interface MySeason {
  season: number
  /** Newest first, for the season picker. */
  seasons: number[]
  /** Confirmed, non-cancelled performances of the season. */
  confirmedTotal: number
  /** How many of those I danced. */
  mine: number
  roles: Record<DanceRole, number>
  armyCrni: number
  armyBili: number
  /** Only months that have at least one confirmed evening. */
  byMonth: MySeasonMonth[]
  /** Nothing danced yet: the page shows the invitation instead of the numbers. */
  empty: boolean
}

function emptyRoles(): Record<DanceRole, number> {
  return Object.fromEntries(DANCE_ROLES.map((r) => [r, 0])) as Record<DanceRole, number>
}

/**
 * One dancer's season out of the season's performances and their lineups.
 *
 * `memberId` may be null: a voditelj who does not dance has no Member row, and
 * the honest answer for them is an empty season rather than somebody else's.
 */
export function buildMySeason(input: {
  season: number
  seasons: readonly number[]
  performances: readonly MySeasonPerformance[]
  lineups: readonly MySeasonLineupRow[]
  memberId: string | null
}): MySeason {
  const confirmed = input.performances.filter((p) => p.confirmed && !p.cancelled)
  const confirmedIds = new Set(confirmed.map((p) => p.id))

  const roles = emptyRoles()
  let armyCrni = 0
  let armyBili = 0

  // One row per (performance, member) is what the unique index guarantees, but a
  // hand-edited database must not be able to count an evening twice either.
  const mineIds = new Set<string>()
  if (input.memberId) {
    for (const row of input.lineups) {
      if (String(row.memberId) !== String(input.memberId)) continue
      if (!confirmedIds.has(String(row.performanceId))) continue
      if (mineIds.has(String(row.performanceId))) continue
      mineIds.add(String(row.performanceId))
      if (isDanceRole(row.role)) {
        roles[row.role] += 1
        const army = ARMY_OF_ROLE[row.role]
        if (army === 'crni') armyCrni += 1
        if (army === 'bili') armyBili += 1
      }
    }
  }

  const months = new Map<number, MySeasonMonth>()
  for (const p of confirmed) {
    const month = Number(p.date.slice(5, 7))
    if (!Number.isInteger(month) || month < 1 || month > 12) continue
    let bar = months.get(month)
    if (!bar) {
      bar = { month, label: shortMonthLabel(month), total: 0, mine: 0 }
      months.set(month, bar)
    }
    bar.total += 1
    if (mineIds.has(p.id)) bar.mine += 1
  }

  return {
    season: input.season,
    seasons: [...input.seasons],
    confirmedTotal: confirmed.length,
    mine: mineIds.size,
    roles,
    armyCrni,
    armyBili,
    byMonth: [...months.values()].sort((a, b) => a.month - b.month),
    empty: mineIds.size === 0,
  }
}

/** A Payload shows doc → the fact this page needs about an evening. */
export function toMySeasonPerformance(doc: Record<string, unknown>): MySeasonPerformance {
  return {
    id: String(doc.id),
    date: toIsoDate(doc.date),
    confirmed: doc.lineupConfirmed === true,
    cancelled: doc.status === 'cancelled',
  }
}

/** A Payload lineups doc → the flat row the aggregation counts. */
export function toMySeasonLineupRow(doc: Record<string, unknown>): MySeasonLineupRow | null {
  const performanceId = relationIdString(doc.performance)
  const memberId = relationIdString(doc.member)
  if (!performanceId || !memberId) return null
  if (!isDanceRole(doc.role)) return null
  return { performanceId, memberId, role: doc.role }
}

export interface MySeasonDeps {
  /** Every performance of the given calendar year. */
  loadPerformances: (season: number) => Promise<Record<string, unknown>[]>
  /** The lineup rows of these performances, in ONE query. */
  loadLineups: (performanceIds: readonly string[]) => Promise<Record<string, unknown>[]>
  /** The calendar year of the earliest performance ever recorded, for the picker. */
  loadFirstSeason: () => Promise<number | null>
  now?: () => Date
}

/**
 * One dancer's season.
 *
 * `requested` is the raw `?sezona=` value; an unparseable or unknown year falls
 * back to the current season, so a mistyped URL shows this year rather than an
 * error page. The lineup query asks for the confirmed evenings only, and not at
 * all when there are none: an empty `in` list would ask the database for every
 * lineup ever written.
 */
export async function loadMySeason(
  requested: unknown,
  memberId: string | null,
  deps: MySeasonDeps,
): Promise<MySeason> {
  const now = deps.now?.() ?? new Date()
  const current = seasonYear(now)
  const firstSeason = await deps.loadFirstSeason()
  const seasons = seasonOptions(firstSeason, current)
  const season = resolveSeason(requested, current, seasons)

  const performances = (await deps.loadPerformances(season)).map(toMySeasonPerformance)
  const confirmedIds = performances.filter((p) => p.confirmed && !p.cancelled).map((p) => p.id)

  const lineupDocs =
    memberId && confirmedIds.length > 0 ? await deps.loadLineups(confirmedIds) : []
  const lineups = lineupDocs
    .map(toMySeasonLineupRow)
    .filter((r): r is MySeasonLineupRow => r !== null)

  return buildMySeason({ season, seasons, performances, lineups, memberId })
}
