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

import { PERFORMANCE_KINDS, type PerformanceKind } from '@/lib/show-performance'
import { LINEUP_ROLES, isLineupRole, type LineupRole } from '@/lib/moreskant-profile'
import type { AttendanceMember } from '@/lib/attendance/rules'

/**
 * The four TITLES (CONTEXT.md -> *Title*): the named parts a voditelj hands
 * out, exactly one of each per confirmed lineup.
 *
 * Still its own vocabulary after #607, and still only four, because "which
 * titles were given" is a different question from "what did this dancer wear".
 * The tally below counts all six dance roles; this is the subset that answers
 * the first question, and it is what the full list's title filters rank by.
 */
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
  role: LineupRole
}

/** One line of the table. */
export interface DancerStats {
  memberId: string
  nickname: string
  /** Confirmed performances this dancer appears in. */
  performances: number
  /**
   * The season's roles, over EVERY kind of evening.
   *
   * **All six dance roles since #607**, not the four titles. Counting only the
   * titles meant a row could say "21 nastupa" and nothing else about twenty-one
   * evenings: a plain crni or bili contributed to the total and to no tally, so
   * Ljestvica could not say whether those were nights in the ranks or nights
   * wearing a crown.
   *
   * **And `voditelj` since #620**, which reverses what this comment used to
   * say. Running a Moreška Experience is not dancing it, and that is still
   * true - but the Experience list on Ljestvica is a count of the Experiences
   * a member was PART of, and the one member who is there every time was the
   * only one it did not count. He can only ever appear on an `experience` row
   * (the lineup route refuses the line anywhere else), so the Moreška list is
   * untouched by this and the two lists still measure what they always did.
   */
  roles: Record<LineupRole, number>
  /** The split behind the tap: performances per kind, zeros included. */
  byKind: Record<PerformanceKind, number>
  /**
   * The same four titles, split by kind of evening (#568).
   *
   * `roles` stays what it has always been — the whole season — and this is the
   * breakdown beside it, because Ljestvica ranks one KIND of evening at a time:
   * a titles line drawn from `roles` sat next to a count that did not include
   * the Experiences it was counting, and two numbers that do not add up are
   * worse than one number that is not there.
   *
   * All six dance roles since #607, for the reason `roles` gives. A reader can
   * therefore add one row's tallies up and get the count printed beside them,
   * which is what makes the breakdown checkable instead of decorative.
   */
  rolesByKind: Record<PerformanceKind, Record<LineupRole, number>>
}

/**
 * The kind vocabulary is `show-performance.ts`'s, never re-typed here: a sixth
 * kind added there has to appear in this table on the same day, and a hand-kept
 * copy is how it would not.
 */
function emptyKinds(): Record<PerformanceKind, number> {
  return Object.fromEntries(PERFORMANCE_KINDS.map((k) => [k, 0])) as Record<
    PerformanceKind,
    number
  >
}

/**
 * The role vocabulary is `moreskant-profile.ts`'s, never re-typed here, for the
 * same reason the kind vocabulary is `show-performance.ts`'s: a seventh dance
 * role added there has to appear in this tally on the same day.
 */
function emptyRoles(): Record<LineupRole, number> {
  return Object.fromEntries(LINEUP_ROLES.map((r) => [r, 0])) as Record<LineupRole, number>
}

/** One `emptyRoles()` per kind, zeros included, so no caller has to guard. */
function emptyRolesByKind(): Record<PerformanceKind, Record<LineupRole, number>> {
  return Object.fromEntries(PERFORMANCE_KINDS.map((k) => [k, emptyRoles()])) as Record<
    PerformanceKind,
    Record<LineupRole, number>
  >
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
    confirmed.set(
      String(p.id),
      (PERFORMANCE_KINDS as readonly string[]).includes(p.kind) ? p.kind : 'ostalo',
    )
  }

  const rows = new Map<string, DancerStats>()
  for (const member of input.roster) {
    rows.set(String(member.id), {
      memberId: String(member.id),
      nickname: label(member),
      performances: 0,
      roles: emptyRoles(),
      byKind: emptyKinds(),
      rolesByKind: emptyRolesByKind(),
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
    // Every lineup role, the plain ones and the voditelj included (#607, #620).
    // `isLineupRole` is the filter; a role outside the vocabulary counts towards
    // the evening and towards no tally, which is what it always did.
    if (isLineupRole(row.role)) {
      stats.roles[row.role] += 1
      stats.rolesByKind[kind][row.role] += 1
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.performances - a.performances || a.nickname.localeCompare(b.nickname, 'hr'),
  )
}

/**
 * The season a `?season=` query string asks for.
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
