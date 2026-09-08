// Dancer statistics (#437, ADR-0024 phase 4). Glossary: CONTEXT.md → *Dancer
// statistics*.
//
// One season, one row per moreškant: how many confirmed performances they
// danced, and how many times each as crni kralj, bili kralj, otmanović and
// bula, plus the split by performance kind behind a tap (story 40).
//
// Two rules carry the whole page and both live here, pure:
//
//   - ONLY CONFIRMED LINEUPS COUNT (story 39). A draft is a half-typed list, so
//     it may not inflate anybody. The filter is on the PERFORMANCE
//     (`lineupConfirmed`), never on the row, because confirmation is one flag
//     per evening.
//   - EVERY ACTIVE MOREŠKANT IS A ROW, even one who has danced nothing: a
//     scoreboard that hides the zeros reads as if those dancers did not exist.
//
// The season is the calendar year of the performance date, ADR-0022's
// definition, and the caller has already scoped its query to it: this module
// counts what it is handed and never re-derives a boundary.

import type { PerformanceKind } from '@/lib/show-performance'
import { isDanceRole, type DanceRole } from '@/lib/moreskant-profile'
import type { AttendanceMember } from '@/lib/attendance/rules'

/** The four roles the scoreboard counts separately (glossary). */
export const STAT_ROLES = ['crni_kralj', 'bili_kralj', 'otmanovic', 'bula'] as const
export type StatRole = (typeof STAT_ROLES)[number]

/** One confirmed performance of the season, flattened to what a count needs. */
export interface StatsPerformance {
  id: string
  kind: PerformanceKind
  /** False for a draft; such a performance contributes nothing at all. */
  confirmed: boolean
}

/** One lineup row, flattened to ids. */
export interface StatsLineupRow {
  performanceId: string
  memberId: string
  role: DanceRole
}

/** One line of the table. */
export interface DancerStats {
  memberId: string
  nickname: string
  /** Confirmed performances this dancer appears in. */
  performances: number
  roles: Record<StatRole, number>
  /** The split behind the tap: performances per kind, zeros included. */
  byKind: Record<PerformanceKind, number>
}

const KINDS: readonly PerformanceKind[] = ['redovna', 'dmc', 'gulliver', 'koncert', 'ostalo']

function emptyKinds(): Record<PerformanceKind, number> {
  return { redovna: 0, dmc: 0, gulliver: 0, koncert: 0, ostalo: 0 }
}

function emptyRoles(): Record<StatRole, number> {
  return { crni_kralj: 0, bili_kralj: 0, otmanovic: 0, bula: 0 }
}

function label(member: AttendanceMember): string {
  const nickname = member.nickname?.trim()
  if (nickname) return nickname
  const name = member.name?.trim()
  return name || String(member.id)
}

/**
 * The season's scoreboard.
 *
 * `performances` must already be the season's rows; unconfirmed ones are
 * dropped here rather than by the caller, so the rule that a draft counts for
 * nothing is stated once and tested directly.
 *
 * Sorted by performances danced, descending, then by nickname (Croatian
 * collation) — story 41, so the table reads at a glance and two dancers on the
 * same number never swap places between renders.
 */
export function aggregateDancerStats(input: {
  performances: readonly StatsPerformance[]
  lineups: readonly StatsLineupRow[]
  roster: readonly AttendanceMember[]
}): DancerStats[] {
  const confirmed = new Map<string, PerformanceKind>()
  for (const p of input.performances) {
    if (!p.confirmed) continue
    confirmed.set(String(p.id), KINDS.includes(p.kind) ? p.kind : 'ostalo')
  }

  const rows = new Map<string, DancerStats>()
  for (const member of input.roster) {
    rows.set(String(member.id), {
      memberId: String(member.id),
      nickname: label(member),
      performances: 0,
      roles: emptyRoles(),
      byKind: emptyKinds(),
    })
  }

  // One member can only be down once per performance (the unique pair), but a
  // duplicated row from a hand-edited database must not count twice either.
  const counted = new Set<string>()

  for (const row of input.lineups) {
    const kind = confirmed.get(String(row.performanceId))
    if (!kind) continue
    const stats = rows.get(String(row.memberId))
    if (!stats) continue
    const key = `${row.performanceId}:${row.memberId}`
    if (counted.has(key)) continue
    counted.add(key)

    stats.performances += 1
    stats.byKind[kind] += 1
    if (isDanceRole(row.role) && (STAT_ROLES as readonly string[]).includes(row.role)) {
      stats.roles[row.role as StatRole] += 1
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.performances - a.performances || a.nickname.localeCompare(b.nickname, 'hr'),
  )
}

/**
 * The season a `?sezona=` query string asks for.
 *
 * Anything that is not a four-digit year inside the known range falls back to
 * the current season (story: "invalid season falls back"), because a mistyped
 * URL should show this year's table rather than an error page.
 */
export function resolveSeason(
  raw: unknown,
  currentSeason: number,
  available: readonly number[] = [],
): number {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!/^\d{4}$/.test(value)) return currentSeason
  const year = Number(value)
  const known = available.length > 0 ? available : [currentSeason]
  return known.includes(year) ? year : currentSeason
}

/**
 * The dropdown: every season from the first performance ever recorded to the
 * current one, newest first. A season with no performances is still listed —
 * the gap is a fact about the schedule, and hiding it would make the dropdown
 * jump years.
 */
export function seasonOptions(firstSeason: number | null, currentSeason: number): number[] {
  const from = firstSeason != null && firstSeason < currentSeason ? firstSeason : currentSeason
  const out: number[] = []
  for (let year = currentSeason; year >= from; year--) out.push(year)
  return out
}
