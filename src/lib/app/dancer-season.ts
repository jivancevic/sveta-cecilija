// A moreškant's season profile (#608). Glossary: CONTEXT.md → *Ljestvica*,
// *Dancer statistics*.
//
// Cecilija showed a dancer to other dancers as a nickname and a number. There
// was nowhere to answer "what did Cici actually do this season" — Članovi holds
// his mobile and his roles, which is a different question for a different
// reader — and "Moja sezona" was a report about one person sitting next to a
// scoreboard of bare numbers.
//
// **One screen, two entry points.** Another dancer's profile and the reader's
// own Moja sezona are the same shape; the reader's carries one block more.
//
// Pure, the shape of `members-screen.ts`: no Payload, no fetch. What this
// module owns is the PROJECTION — what of a Member reaches a dancer's screen —
// and the one derivation the profile needs that nothing else had: a season's
// evenings for one person.
//
// The record beside them used to be "Najbolja sezona" (`bestSeason`, with
// `seasonCounts` under it); **#628 replaced it with Najduži niz**, which is a
// different shape entirely — it is a run through the society's whole chain of
// confirmed moreške rather than a tally of one person's years — so it lives in
// `niz.ts` with the rest of the niz and not here.
//
// **The PII boundary is this file's job** (ADR-0024, amended by #608). A
// `MemberRosterRow` carries a mobile and an e-mail because Članovi needs the
// first; neither may reach a profile, which every moreškant on the roster can
// open. `toDancerIdentity` is an explicit projection and never a spread, for
// the same reason `toAttendanceMember` is, and `dancer-season-no-pii.test.ts`
// scans the screen's sources to keep it that way.

import { isDanceRole, type DanceRole } from '@/lib/moreskant-profile'
import type { PerformanceKind } from '@/lib/show-performance'
import { armyOfPrimaryRole, type BoardArmy, type LeaderboardKind } from './leaderboard-rank'

/**
 * Who the profile is about.
 *
 * The name IS here, and that is the amendment (#608): every other `/app`
 * surface shows nicknames only, but seventy people who all know each other need
 * the name behind the nickname, and a new dancer reading "Cici" learns nothing.
 * The mobile and the e-mail stay where they were.
 */
export interface DancerIdentity {
  memberId: string
  /** Ime i prezime. Visible to every dancer on this screen and nowhere else. */
  name: string
  /** The nickname, or null for a Member who has none. */
  nickname: string | null
  /** The roles this person is ABLE to dance, from their profile. */
  roles: DanceRole[]
  /** The army of their primary role: the colour of their disc. */
  army: BoardArmy | null
  /** Two letters of the name, for the disc. */
  initials: string
}

/** The subset of a roster row this screen may read. Never the whole row. */
export interface DancerIdentitySource {
  id: string
  name: string
  nickname: string | null
  roles: string[]
  primaryRole: string | null
  isMoreskant: boolean
}

/**
 * A roster row → what the profile draws.
 *
 * Returns null for a Member who is not a moreškant: an ADR-0019
 * comp-attribution name has no season, and rendering one a profile would invent
 * a dancer out of a bookkeeping row.
 */
export function toDancerIdentity(
  row: DancerIdentitySource | null,
  initials: string,
): DancerIdentity | null {
  if (!row || !row.isMoreskant) return null
  return {
    memberId: String(row.id),
    name: row.name,
    nickname: row.nickname,
    roles: row.roles.filter(isDanceRole),
    army: armyOfPrimaryRole(row.primaryRole),
    initials,
  }
}

/** One evening this dancer danced, as the profile's list prints it. */
export interface DancerEvening {
  performanceId: string
  /** YYYY-MM-DD. */
  date: string
  kind: PerformanceKind
  /**
   * Where it was, for a REGULAR evening.
   *
   * Null for everything else, and that is the rule rather than missing data: a
   * vanredna is a booking, and naming its venue on a screen every dancer opens
   * is one step from naming the client. The register a dancer reads says
   * "Vanredna" and stops (CONTEXT.md, the two registers).
   */
  place: string | null
  /** What they wore that evening. */
  role: DanceRole
}

/** One performance of the season, flattened to what the list needs. */
export interface DancerSeasonPerformance {
  id: string
  date: string
  kind: PerformanceKind
  /** The public venue label; used only where {@link DancerEvening.place} is. */
  place: string | null
  confirmed: boolean
  cancelled: boolean
  /** A booking rather than one of the society's own evenings. */
  isPublic: boolean
}

/** One lineup row, flattened to ids. */
export interface DancerSeasonLineupRow {
  performanceId: string
  memberId: string
  role: DanceRole
}

/**
 * The evenings one dancer danced, newest first.
 *
 * Only confirmed, non-cancelled evenings, which is the rule every other count
 * in the app applies: a draft is a half-typed list and a cancelled evening
 * never happened. One row per evening even if the database somehow holds two.
 */
export function dancerEvenings(input: {
  performances: readonly DancerSeasonPerformance[]
  lineups: readonly DancerSeasonLineupRow[]
  memberId: string
}): DancerEvening[] {
  const byId = new Map(
    input.performances.filter((p) => p.confirmed && !p.cancelled).map((p) => [p.id, p]),
  )
  const seen = new Set<string>()
  const out: DancerEvening[] = []

  for (const row of input.lineups) {
    if (String(row.memberId) !== String(input.memberId)) continue
    const performance = byId.get(String(row.performanceId))
    if (!performance || seen.has(performance.id)) continue
    if (!isDanceRole(row.role)) continue
    seen.add(performance.id)
    out.push({
      performanceId: performance.id,
      date: performance.date,
      kind: performance.kind,
      // The society's own evening names its house; a booking names nothing.
      place: performance.isPublic ? performance.place : null,
      role: row.role,
    })
  }

  return out.sort((a, b) => b.date.localeCompare(a.date) || b.performanceId.localeCompare(a.performanceId))
}

/** A dancer's standing on one of the two lists. */
export interface DancerStanding {
  kind: LeaderboardKind
  /** Confirmed evenings of this list's kinds. */
  count: number
  /** How many the season had: what the ring is filled against. */
  of: number
  /** Their place, or null when they have no row on this list. */
  rank: number | null
  /** How many moreškanti the list holds. */
  total: number
}

/** The kinds a caller must cover, so a new kind cannot fall out of both rings. */
export const PROFILE_LISTS: LeaderboardKind[] = ['moreska', 'experience']
