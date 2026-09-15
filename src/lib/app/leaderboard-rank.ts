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
//   - a streak is NOT one of the season's numbers. `niz` arrives here from its
//     own module (`niz.ts`) and its own read, because it crosses seasons and
//     everything else in here is one season's; it rides on a row rather than
//     being ranked by, and no list is ever ordered by it (#628).

import { ARMY_OF_ROLE, isDanceRole, type LineupRole } from '@/lib/moreskant-profile'
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
  /**
   * Competition rank: equal counts share it, the next one skips.
   *
   * **Zero is not a rank, so a count of zero has none** (#614). The screen used
   * to tell a dancer with no Experience at all that they were "12. s 0
   * nastupa", which is arithmetically true and says nothing: everybody who has
   * not danced shares that place, and the sentence reads as a result.
   *
   * NULL rather than a zero sentinel, so the four screens that draw a rank are
   * made to say what they do about it by `tsc` rather than by this comment —
   * and so it matches `ProfileRingData.rank`, which models the same "no place
   * here" in the same feature.
   */
  rank: number | null
  memberId: string
  nickname: string
  /**
   * This row's count against the leader's, 0 to 1 (#614).
   *
   * The bar behind the row. The board's own numbers already contain how close
   * the season is — 21, 20, 19, 18, 17, 17, 17 is the tightest race the season
   * can have — and a column of digits shows none of it. No new data: the same
   * count, given a length.
   */
  share: number
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
  /**
   * The niz that is still running: confirmed moreške in a row, counted back
   * from the most recent one (#628, CONTEXT.md → *Niz*).
   *
   * **Zero for a broken run, not its old length.** A flame is a statement about
   * form and it is only ever drawn while the run is going, so what a dancer did
   * before a gap is the profile's business and never the list's. The threshold
   * is `flameNiz`'s; this row carries the raw number so the two screens cannot
   * disagree about where it is.
   */
  niz: number
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
  /**
   * `memberId` → their running niz; a missing key reads as none (#628).
   *
   * Handed in rather than derived, because a niz crosses seasons and every
   * other number in this module is one season's: deriving it here would mean
   * this function reading rows its own caller deliberately scoped to a year.
   */
  niz?: Record<string, number>
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
  // The leader's count is what every bar is drawn against. Taken after the
  // sort, so it is this list's own leader rather than the season's.
  const top = counted[0]?.performances ?? 0

  counted.forEach((entry, index) => {
    if (previous === null || entry.performances !== previous) {
      rank = index + 1
      previous = entry.performances
    }
    const memberId = String(entry.row.memberId)
    out.push({
      // Zero is not a place (#614). The rows still sort where they sort and
      // still count in `total`; they simply hold no rank to print.
      rank: entry.performances === 0 ? null : rank,
      share: top > 0 ? entry.performances / top : 0,
      memberId,
      nickname: entry.row.nickname,
      performances: entry.performances,
      army: entry.army,
      initials: input.initials?.[memberId] ?? '',
      title: null,
      niz: input.niz?.[memberId] ?? 0,
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
  /**
   * What share of the rest of the roster the reader is ahead of, 0 to 100
   * (#614, Q6).
   *
   * Beside the rank rather than instead of it: the rank is what gets talked
   * about at a rehearsal, and "13. od 70" is the number a dancer says out loud.
   * But it is also cold — thirteenth of what, and is that good — and a
   * percentage answers that without asking anybody to divide. Null when nobody
   * is behind the reader, because "bolji si od 0%" is a sentence that only
   * exists to be unkind.
   */
  betterThan: number | null
  /**
   * The dancer immediately in front, for the line under the card (#614, Q5).
   *
   * One person, never a list: the point is the next step, and the reader
   * already knows what the top of the board looks like. Null at the top.
   */
  ahead: { nickname: string; performances: number } | null
}

/**
 * Where the reader stands on one list, or null when they have no row on it.
 *
 * Also null for a reader who has danced NOTHING of this list's kinds (#614):
 * a zero shares its place with everybody else who has not started, so the
 * sentence would be a rank in name only. The screens print "još nemaš" there,
 * which is the same fact without the false result.
 */
export function myStanding(ranked: readonly RankRow[]): MyStanding | null {
  const mine = ranked.find((r) => r.me)
  if (!mine || mine.performances === 0) return null

  const higher = [...new Set(ranked.map((r) => r.performances))]
    .filter((count) => count > mine.performances)
    .sort((a, b) => a - b)
  const nextCount = mine.rank === 1 || higher.length === 0 ? null : higher[0]
  const nextRow = nextCount === null ? null : (ranked.find((r) => r.performances === nextCount) ?? null)

  const others = ranked.length - 1
  const below = ranked.filter((r) => !r.me && r.performances < mine.performances).length

  return {
    // Non-null by the guard above: a reader with a count has a place.
    rank: mine.rank ?? 0,
    performances: mine.performances,
    total: ranked.length,
    toNextPlace: nextCount === null ? null : nextCount - mine.performances,
    nextPlace: nextRow?.rank ?? null,
    betterThan: others > 0 && below > 0 ? Math.round((below / others) * 100) : null,
    ahead: nextRow ? { nickname: nextRow.nickname, performances: nextRow.performances } : null,
  }
}

/**
 * How big a list's leader has to be before the list is ranked at all (#614).
 *
 * The Experience is danced by three pairs a handful of times a year. In a
 * season whose best score is 2, a single evening buys "3. mjesto od 70" and the
 * same gold trophy that twenty-one moreške buys on the board next to it — every
 * number true, the whole message false. Five is the point at which a place on
 * that list is a season's worth of turning up rather than an accident of who
 * was free one morning.
 */
export const RANKED_MIN_TOP = 5

/**
 * Whether this list is big enough to be ranked, or only counted.
 *
 * Moreška always is, and the floor is deliberately not applied to it: it is the
 * list the society ranks and the one every other number on the screen is
 * measured against, so blanking it through April — when the leader is on one —
 * would empty the screen exactly when the season is most worth watching. The
 * inflation the floor exists to stop is a SMALL list wearing a big list's
 * medals, and Moreška is the big list.
 *
 * An unranked list gets a leader line and a plain list: a count, never a place.
 */
export function listIsRanked(kind: LeaderboardKind, ranked: readonly RankRow[]): boolean {
  const top = ranked[0]?.performances ?? 0
  // Nobody has danced one: there is no leader, so there is no ranking either.
  // A podium of three zeros is three empty steps.
  if (top <= 0) return false
  return kind !== 'experience' || top >= RANKED_MIN_TOP
}

/** Everybody on the top count of a list, and what that count is. */
export interface Leaders {
  count: number
  /** Every holder, in the list's own order. A tie is named, never broken. */
  nicknames: string[]
}

/**
 * Who leads a list, for a list too small to rank (#614).
 *
 * Null when nobody has danced one: a leader of nothing is not a leader, and the
 * empty sentence the screen already has says it better.
 */
export function leaders(ranked: readonly RankRow[]): Leaders | null {
  const count = ranked[0]?.performances ?? 0
  if (count <= 0) return null
  return {
    count,
    nicknames: ranked.filter((r) => r.performances === count).map((r) => r.nickname),
  }
}

/**
 * The place ONE more nastup would reach (#614, Q4).
 *
 * The board already knows what is coming and whether the reader has said they
 * are coming to it, so it can say "dođeš li u srijedu, ideš na 11. mjesto"
 * instead of waiting a week to report it. The arithmetic is the ranking's own:
 * a rank is one plus the number of dancers strictly above, and a tie shares a
 * rank, so reaching somebody's count reaches their place rather than the one
 * under it.
 *
 * Null for a reader with no row on the list.
 */
export function projectedRank(ranked: readonly RankRow[], plus = 1): number | null {
  const mine = ranked.find((r) => r.me)
  if (!mine) return null
  const value = mine.performances + plus
  return 1 + ranked.filter((r) => !r.me && r.performances > value).length
}

/** What the last confirmed evening changed between the reader and one neighbour. */
export interface RivalNews {
  kind: 'passed' | 'overtaken'
  nickname: string
}

/**
 * Who the reader went past on the last evening, or who went past them (#614, Q5).
 *
 * Derived from the same two rankings the movement arrow is, so it costs no
 * query and cannot disagree with the arrow beside it. Compared by COUNT rather
 * than by rank: a dancer level with the reader shares their place and has not
 * passed anybody.
 *
 * Good news first when the evening produced both, and a loss is said in exactly
 * the same words as a win — "Cici te prestigao" is a fact about a season, and
 * the reader was probably at work. Only ever rendered on the reader's own
 * screen, never on the profile of the person named.
 */
export function rivalNews(
  current: readonly RankRow[],
  previous: readonly RankRow[],
): RivalNews | null {
  const now = current.find((r) => r.me)
  const before = previous.find((r) => r.me)
  if (!now || !before) return null

  // BEFORE, by count, keyed for the lookup. A dancer LEVEL with the reader
  // counts as "not behind": rising out of a tie is going past somebody, which
  // is exactly what the rank does (1, 1 becomes 1, 2).
  const then = new Map(previous.map((r) => [r.memberId, r.performances]))

  const moved = current.filter((r) => {
    if (r.me) return false
    const was = then.get(r.memberId)
    return was !== undefined
  })

  // `current` is sorted by count descending, so the first dancer the reader has
  // gone past is the closest one below them, and the last dancer now ahead is
  // the closest one above. The news is always about the neighbour.
  const passed = moved.find((r) => {
    const was = then.get(r.memberId) as number
    return was >= before.performances && r.performances < now.performances
  })
  if (passed) return { kind: 'passed', nickname: passed.nickname }

  const overtook = moved
    .filter((r) => {
      const was = then.get(r.memberId) as number
      return was <= before.performances && r.performances > now.performances
    })
    .at(-1)
  return overtook ? { kind: 'overtaken', nickname: overtook.nickname } : null
}

/**
 * The three chips that count a title being given, in the order they are read.
 *
 * DERIVED from the chips and `filterCountsTitle`, never re-typed: the full list
 * builds its second group of chips the same way, and a hand-written copy here
 * would be a third spelling of a set that `STAT_ROLES` already owns.
 */
export const TITLE_FILTERS = BOARD_FILTERS.filter(filterCountsTitle)

export type TitleFilter = (typeof TITLE_FILTERS)[number]

/** One title, and who wore it most this season. */
export interface SeasonKing {
  role: TitleFilter
  /** Every holder of the top count. Equal counts share the title. */
  nicknames: string[]
  count: number
}

/**
 * Kralj sezone: who wore each title most often (#614, Q8).
 *
 * The one piece of gamification on this screen that is the society's own rather
 * than borrowed from a fitness app — the titles are what a voditelj hands out
 * every evening, and the season's tally of them is a thing people already
 * argue about.
 *
 * It does NOT break the rule that a titula belongs to an evening and never to a
 * person (CONTEXT.md → *Title*): this is a season COUNTER, exactly as a rank
 * is, and nothing here puts a crown on anybody's profile or on their disc. It
 * is the same number the title chips on the full list already show, said once
 * at the foot of the board instead of only behind a filter.
 */
export function seasonKings(input: {
  rows: readonly DancerStats[]
  kind: LeaderboardKind
}): SeasonKing[] {
  return TITLE_FILTERS.map((role) => {
    const top = leaders(rankDancers({ rows: input.rows, kind: input.kind, filter: role }))
    return top ? { role, nicknames: top.nicknames, count: top.count } : null
  }).filter((k): k is SeasonKing => k !== null)
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
  // A reader who had no place then, or has none now, has not MOVED: they
  // started. The card says so in words instead (#614).
  if (!now || !before || now.rank === null || before.rank === null) return null
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
  /** Null for the voditelj (#620): he is in neither vojska. */
  army: BoardArmy | null
  /** The ROLE the disc stands for, never a title (see `MARK_OF_ROLE`). */
  role: LineupRole
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
export const MARK_OF_ROLE: Record<LineupRole, RoleMarkSpec> = {
  crni: { army: 'crni', role: 'crni' },
  crni_kralj: { army: 'crni', role: 'crni_kralj' },
  otmanovic: { army: 'crni', role: 'otmanovic' },
  bili: { army: 'bili', role: 'bili' },
  bili_kralj: { army: 'bili', role: 'bili_kralj' },
  bula: { army: 'bula', role: 'bula' },
  // No army at all (#620): the voditelj of a Moreška Experience is in neither,
  // so his disc is the sunk ground with the gold ring `RoleMark` draws for it.
  voditelj: { army: null, role: 'voditelj' },
}

/**
 * The order a row's tallies are drawn in, and it is NOT `DANCE_ROLES`.
 *
 * Grouped by army — the crni three, then the bili two, then the bula — so the
 * eye reads a row as "mostly black, a bit of red" before it reads any number.
 * `DANCE_ROLES` interleaves the armies because that is the order the profile
 * form needs, which is a different screen with a different question.
 */
export const TALLY_ORDER: LineupRole[] = [
  'crni',
  'crni_kralj',
  'otmanovic',
  'bili',
  'bili_kralj',
  'bula',
  // Last, and after the armies rather than among them, because it is the one
  // line that is not a dance (#620). It can only ever be non-zero on the
  // Experience list, and the zeros filter below drops it everywhere else.
  'voditelj',
]

/** One line of a row's breakdown: which role, and how many evenings of it. */
export interface RoleTally {
  role: LineupRole
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
