// The two lists of Ljestvica, and how a list is ranked (#568, decision Q36).
//
// Pure, and deliberately DOWNSTREAM of `aggregateDancerStats` the way
// `buildLeaderboard` is: the count a dancer is ranked by is the count the
// scoreboard already produced, so the screen, the Početna card and the full
// list can never print three numbers for one season.
//
// What this module adds on top of that count is the redesign's own decision:
// **one season is two lists.** A Moreška Experience is danced by three pairs in
// the society's own premises (glossary: *Moreška Experience*) and a full evening
// is danced by the whole ansambl; ranking both in one column told a dancer who
// had danced twelve Redovne that they were behind somebody with fifteen
// Experiences. So `experience` is its own list and everything else is Moreška,
// each with its own podium and its own ranking.
//
// The rules that do NOT change, straight from the glossary (*Ljestvica*):
//
//   - only CONFIRMED lineups count (already true of the rows handed in),
//   - every active moreškant is a row, at zero as much as at twenty,
//   - equal counts SHARE a rank and the next rank skips (1, 1, 3): a season is
//     not a race with a photo finish, and inventing an order inside a tie would
//     make up a fact the lineups do not contain,
//   - no streaks, ever.

import { ARMY_OF_ROLE, isDanceRole } from '@/lib/moreskant-profile'
import { PERFORMANCE_KINDS, type PerformanceKind } from '@/lib/show-performance'
import type { DancerStats } from '@/lib/lineup/stats'

/** The two lists of the Ljestvica segment, in the order they are read. */
export const LEADERBOARD_KINDS = ['moreska', 'experience'] as const

export type LeaderboardKind = (typeof LEADERBOARD_KINDS)[number]

/**
 * How many rows a list shows before "vidi cijeli popis".
 *
 * Twenty is roughly a phone screen of scrolling and comfortably more than the
 * ansambl of one evening; the rest of the roster is one tap away rather than
 * hidden, because a board that hides the bottom is the board people stop
 * opening.
 */
export const TOP_ROWS = 20

/**
 * Which list `?kind=` asks for, defaulting to Moreška.
 *
 * Anything unrecognised opens on Moreška rather than erroring: a stale link is
 * still a link to the screen.
 */
export function parseLeaderboardKind(raw: string | undefined | null): LeaderboardKind {
  return LEADERBOARD_KINDS.includes(raw as LeaderboardKind)
    ? (raw as LeaderboardKind)
    : 'moreska'
}

/**
 * The performance kinds one list counts.
 *
 * Read off `PERFORMANCE_KINDS` rather than typed out, so a seventh kind added
 * there lands in the Moreška list on the same day instead of falling out of
 * both.
 */
export function kindsOf(kind: LeaderboardKind): PerformanceKind[] {
  return kind === 'experience'
    ? ['experience']
    : PERFORMANCE_KINDS.filter((k) => k !== 'experience')
}

/** The three discs a `RoleMark` draws. A bula is in neither army, hence its own. */
export type BoardArmy = 'crni' | 'bili' | 'bula'

/**
 * The army a dancer's profile puts them in, exactly as the Moreška screen's
 * `identityOf` reads it: `ARMY_OF_ROLE` decides, and the role it maps to
 * `null` is the bula, who is in neither army and wears her own disc.
 *
 * The army is a PROFILE fact and may be read from one. A *titula* is not: it
 * belongs to one evening's lineup and never to a person (CONTEXT.md → *Title*),
 * which is why nothing in this module produces one.
 */
export function armyOfPrimaryRole(primaryRole: string | null | undefined): BoardArmy | null {
  if (!isDanceRole(primaryRole)) return null
  return ARMY_OF_ROLE[primaryRole] ?? 'bula'
}

export interface RankRow {
  /** Competition rank: equal counts share it, the next one skips. */
  rank: number
  memberId: string
  nickname: string
  /** Confirmed nastupi of THIS list's kinds. */
  performances: number
  /** The disc beside the name; null for a dancer with no primary role yet. */
  army: BoardArmy | null
  /**
   * Always null, and that is a decision rather than a gap: a titula is given
   * per nastup, so a season's counts contain no title anybody currently holds,
   * and a crown drawn from a profile would be a crown nobody was given.
   */
  title: null
  /** The viewer's own row. */
  me: boolean
  /** Danced every confirmed evening of this list's kinds (and there was one). */
  fullSeason: boolean
}

/**
 * One list of the season, ranked.
 *
 * The incoming rows are the scoreboard's (every active moreškant, sorted by the
 * WHOLE season). This re-sorts them by the list's own count, because a list of
 * Experiences ordered by somebody's Redovne would be ordered by a number it
 * does not show.
 *
 * `myMemberId` may be null (a voditelj who does not dance): the list still
 * ranks, it simply has no row of the reader's own in it.
 */
export function rankDancers(input: {
  rows: readonly DancerStats[]
  kind: LeaderboardKind
  /** `memberId` → the profile's primary role; missing reads as "no role". */
  primaryRoles?: Record<string, string | null>
  myMemberId?: string | null
  /** Confirmed performances of this list's kinds, for "puna sezona". */
  confirmed?: number
}): RankRow[] {
  const kinds = kindsOf(input.kind)
  const mine = input.myMemberId == null ? null : String(input.myMemberId)
  const confirmed = input.confirmed ?? 0

  const counted = input.rows.map((row) => ({
    row,
    performances: kinds.reduce((sum, k) => sum + (row.byKind[k] ?? 0), 0),
  }))

  // The scoreboard's own tie-break, re-applied to this list's count: by count
  // descending, then by nickname in Croatian collation, so two dancers on the
  // same number never swap places between renders.
  counted.sort(
    (a, b) =>
      b.performances - a.performances || a.row.nickname.localeCompare(b.row.nickname, 'hr'),
  )

  const out: RankRow[] = []
  let rank = 0
  let previous: number | null = null

  counted.forEach((entry, index) => {
    if (previous === null || entry.performances !== previous) {
      rank = index + 1
      previous = entry.performances
    }
    const memberId = String(entry.row.memberId)
    out.push({
      rank,
      memberId,
      nickname: entry.row.nickname,
      performances: entry.performances,
      army: armyOfPrimaryRole(input.primaryRoles?.[memberId] ?? null),
      title: null,
      me: mine !== null && memberId === mine,
      fullSeason: confirmed > 0 && entry.performances === confirmed,
    })
  })

  return out
}

export interface MyStanding {
  rank: number
  performances: number
  /** Every moreškant on this list. */
  total: number
  /**
   * How many more nastupa would reach the next higher distinct count, so the
   * sentence can say what the gap actually is. Null at the top.
   */
  toNextPlace: number | null
  /**
   * The rank those nastupi would actually reach: the rank the dancers already
   * at that count hold, because reaching it TIES them and a tie shares a rank.
   * Not `rank - 1`, which is a rank nobody may hold — with ranks 1, 1, 3 the
   * dancer at 3 reaches 1, never 2. Null whenever `toNextPlace` is.
   */
  nextPlace: number | null
}

/** Where the reader stands on one list, or null when they have no row on it. */
export function myStanding(ranked: readonly RankRow[]): MyStanding | null {
  const mine = ranked.find((r) => r.me)
  if (!mine) return null

  const higher = [...new Set(ranked.map((r) => r.performances))]
    .filter((count) => count > mine.performances)
    .sort((a, b) => a - b)
  const nextCount = mine.rank === 1 || higher.length === 0 ? null : higher[0]
  const nextPlace =
    nextCount === null ? null : (ranked.find((r) => r.performances === nextCount)?.rank ?? null)

  return {
    rank: mine.rank,
    performances: mine.performances,
    total: ranked.length,
    toNextPlace: nextCount === null ? null : nextCount - mine.performances,
    nextPlace,
  }
}

export interface BoardView {
  /** The three steps of the podium, in finishing order. Fewer is fine. */
  podium: RankRow[]
  /** What the list under the podium shows: rank 4 up to the cut. */
  rows: RankRow[]
  /**
   * The reader's own row when it falls outside the cut, so the one number they
   * opened the screen for is never behind a "vidi cijeli popis".
   */
  pinned: RankRow | null
  /** The reader's row wherever it is, for the sentence above the list. */
  me: RankRow | null
  /** Every moreškant on the list, shown or not. */
  total: number
  /** There is more than the screen is showing. */
  truncated: boolean
}

/**
 * The screen's slice of a ranked list: a podium, the rows behind it, and the
 * reader pinned underneath when they are further down than the cut.
 *
 * The cut is by POSITION, not by rank: with ranks 1, 1, 3 the twentieth row is
 * still the twentieth row, and cutting by rank would show a different number of
 * dancers depending on how the season tied.
 */
export function boardView(ranked: readonly RankRow[], limit: number = TOP_ROWS): BoardView {
  const shown = ranked.slice(0, Math.max(0, limit))
  const me = ranked.find((r) => r.me) ?? null
  const pinned = me && !shown.some((r) => r.me) ? me : null

  return {
    podium: shown.slice(0, 3),
    rows: shown.slice(3),
    pinned,
    me,
    total: ranked.length,
    truncated: ranked.length > shown.length,
  }
}
