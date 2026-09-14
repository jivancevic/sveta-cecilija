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

import { ARMY_OF_ROLE, isDanceRole, type DanceRole } from '@/lib/moreskant-profile'
import { STAT_ROLES, type StatRole } from '@/lib/lineup/stats'
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

/* ── The seven chips of the full list (#607, decision Q2) ────────────────
   They do TWO different things, and the asymmetry is the decision rather
   than an oversight.

     crni / bili / bula      select PEOPLE, by the army of their profile's
                             primary role, and keep counting every evening
                             they danced.
     crni kralj / bili kralj
     / otmanovic             count how many times the title was GIVEN to them.

   The first three answer "who is the most active crni", the second three
   answer "who have we given the crown to", and collapsing them into one rule
   breaks the first: a dancer whose primary role is crni fills in as bili when
   that army is short, and under "crni" he must still rank on his whole season
   rather than on the nights he happened to wear black. The society reads him
   as a crni who turns up, which is what the chip is for.

   A consequence, intended: summing the three army lists overshoots the
   season's evenings. The two groups measure different things, so their totals
   were never going to reconcile. */

/** Every chip of the full list, in the order they are read. */
export const BOARD_FILTERS = [
  'svi',
  'crni',
  'bili',
  'bula',
  'crni_kralj',
  'bili_kralj',
  'otmanovic',
] as const

export type BoardFilter = (typeof BOARD_FILTERS)[number]

/**
 * Which chip `?role=` asks for, defaulting to everybody.
 *
 * Anything unrecognised opens on `svi` rather than erroring, the way a stale
 * `?kind=` does: a link that has outlived a vocabulary is still a link to the
 * screen.
 */
export function parseBoardFilter(raw: string | undefined | null): BoardFilter {
  return BOARD_FILTERS.includes(raw as BoardFilter) ? (raw as BoardFilter) : 'svi'
}

/**
 * True for the three chips that count a TITLE rather than select a person.
 *
 * `bula` is deliberately NOT one of them even though it is a title: a bula who
 * is not in the postava has no lineup row at all (CONTEXT.md → *Title*), so her
 * evenings danced and her evenings as bula are the same number and the two
 * readings cannot disagree. Filing her with the armies keeps the screen's
 * sentence true — "these three pick people" — instead of adding a fourth case
 * that behaves like the first three anyway.
 */
export function filterCountsTitle(filter: BoardFilter): filter is StatRole {
  return filter !== 'bula' && (STAT_ROLES as readonly string[]).includes(filter)
}

/** True for a chip that narrows the list to one army. */
function filterSelectsArmy(filter: BoardFilter): filter is BoardArmy {
  return filter === 'crni' || filter === 'bili' || filter === 'bula'
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
  /**
   * What this row is ranked by: confirmed nastupi of this list's kinds, or —
   * under one of the three title chips — how many times that title was given.
   */
  performances: number
  /** The disc beside the name; null for a dancer with no primary role yet. */
  army: BoardArmy | null
  /**
   * Two letters of the dancer's real name, for the disc (#607).
   *
   * Without them every disc on this screen is a blank colour swatch: nobody
   * wears a title in a season's counts, so the mark has nothing to draw. The
   * letters come from the NAME rather than the nickname, because the nickname
   * is already printed beside the disc and repeating it identifies nobody —
   * "who is Cici" is exactly the question the initials answer. Empty when the
   * roster has no name to take them from; `RoleMark` then draws a plain disc.
   */
  initials: string
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
  /** `memberId` → two letters of their name, for the disc. */
  initials?: Record<string, string>
  myMemberId?: string | null
  /** Confirmed performances of this list's kinds, for "puna sezona". */
  confirmed?: number
  /** Which chip is on; `svi` (everybody, every evening) by default. */
  filter?: BoardFilter
}): RankRow[] {
  const kinds = kindsOf(input.kind)
  const mine = input.myMemberId == null ? null : String(input.myMemberId)
  const confirmed = input.confirmed ?? 0
  const filter = input.filter ?? 'svi'
  const byTitle = filterCountsTitle(filter)

  let counted = input.rows.map((row) => ({
    row,
    army: armyOfPrimaryRole(input.primaryRoles?.[String(row.memberId)] ?? null),
    performances: byTitle
      ? kinds.reduce((sum, k) => sum + (row.rolesByKind[k]?.[filter] ?? 0), 0)
      : kinds.reduce((sum, k) => sum + (row.byKind[k] ?? 0), 0),
  }))

  // An army chip narrows the list to the people IN that army; a title chip
  // narrows it to the people who wore it, which is the same as dropping zeros.
  if (filterSelectsArmy(filter)) counted = counted.filter((e) => e.army === filter)

  // "Every active moreškant is a row" is a rule about THE SEASON, so it holds
  // where the season is what is on the screen. Under a chip it would fill the
  // list with people the chip is not about: sixty zeros under "crni kralj" is
  // not a ranking of anything.
  if (filter !== 'svi') counted = counted.filter((e) => e.performances > 0)

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
      army: entry.army,
      initials: input.initials?.[memberId] ?? '',
      title: null,
      me: mine !== null && memberId === mine,
      // Only where the count IS the season. Under a title chip the number is
      // how many crowns somebody wore, and "wore the crown every evening of the
      // season" is not the fact "puna sezona" names.
      fullSeason: !byTitle && confirmed > 0 && entry.performances === confirmed,
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

/**
 * How far the reader moved on the last evening (#607).
 *
 * Positive is up. Null when there is nothing to say: no row of the reader's own
 * in one of the two rankings, or a rank that did not change — a zero is not a
 * result and printing it turns a piece of news into furniture.
 *
 * DERIVED, never stored: `previous` is the same season ranked again with its
 * most recent confirmed evening left out, which the loader can produce from the
 * rows it already has. A stored snapshot would be one more thing to keep in
 * step with a lineup a voditelj can still edit after the fact.
 *
 * A DROP is returned like a rise and the screen prints it the same way.
 * Somebody passed the reader because the reader was not there; that is a fact
 * about the season, and stating it plainly is the opposite of a reproach.
 */
export function rankMovement(
  current: readonly RankRow[],
  previous: readonly RankRow[],
): number | null {
  const now = current.find((r) => r.me)
  const before = previous.find((r) => r.me)
  if (!now || !before) return null
  const moved = before.rank - now.rank
  return moved === 0 ? null : moved
}

/* ── Drawing a role (#607) ────────────────────────────────────────────────
   A `RoleMark` is two facts, and a tally needs both: the DISC is the army and
   the GLYPH is the title. The mapping lives here, once, because three surfaces
   draw it — the full list's chips, the tallies in its rows, and the season
   profile (#608) — and three hand-written copies of "which army is an
   otmanović in" is exactly the drift `ARMY_OF_ROLE` exists to prevent. */

export interface RoleMarkSpec {
  army: BoardArmy
  /** The ROLE the disc stands for, never a title (see `MARK_OF_ROLE`). */
  role: DanceRole
}

/**
 * What to draw for one dance role: a chip, or a tally saying how often this
 * role was danced.
 *
 * It carries the role itself and NOT a title (#612). The two produce the same
 * drawing, so this used to express a role through the nastup-side `title`
 * prop — which is exactly the confusion the mark's two meanings exist to
 * prevent (CONTEXT.md *Znak*): a disc standing for "crni kralj, four times
 * this season" is a role, and a title belongs to one evening and to one
 * holder. Nothing here is of an evening, so nothing here has a title.
 *
 * The bula gets a plain gold disc rather than the titled one for the same
 * reason: `ui-mark--titled` is the white ring that marks the bula OF AN
 * EVENING.
 */
export const MARK_OF_ROLE: Record<DanceRole, RoleMarkSpec> = {
  crni: { army: 'crni', role: 'crni' },
  crni_kralj: { army: 'crni', role: 'crni_kralj' },
  otmanovic: { army: 'crni', role: 'otmanovic' },
  bili: { army: 'bili', role: 'bili' },
  bili_kralj: { army: 'bili', role: 'bili_kralj' },
  bula: { army: 'bula', role: 'bula' },
}

/**
 * The order a row's tallies are drawn in, and it is NOT `DANCE_ROLES`.
 *
 * Grouped by army — the crni three, then the bili two, then the bula — so the
 * eye reads a row as "mostly black, a bit of red" before it reads any number.
 * `DANCE_ROLES` interleaves the armies because that is the order the profile
 * form needs, which is a different screen with a different question.
 */
export const TALLY_ORDER: DanceRole[] = [
  'crni',
  'crni_kralj',
  'otmanovic',
  'bili',
  'bili_kralj',
  'bula',
]

/** One line of a row's breakdown: which role, and how many evenings of it. */
export interface RoleTally {
  role: DanceRole
  count: number
}

/**
 * A dancer's roles in one list's kinds, in drawing order, zeros dropped.
 *
 * The counts sum to the number printed at the end of the row, which is the
 * whole point of counting the plain roles as well: a reader can check the
 * arithmetic, and a breakdown nobody can check is decoration.
 */
export function roleTallies(
  row: Pick<DancerStats, 'rolesByKind'>,
  kind: LeaderboardKind,
): RoleTally[] {
  const kinds = kindsOf(kind)
  return TALLY_ORDER.map((role) => ({
    role,
    count: kinds.reduce((sum, k) => sum + (row.rolesByKind[k]?.[role] ?? 0), 0),
  })).filter((t) => t.count > 0)
}
