// The Ljestvica (#457, glossary: *Ljestvica*): the season's moreškanti ranked.
//
// Pure, and deliberately DOWNSTREAM of `loadSeasonStats` rather than beside it:
// the count a dancer is ranked by is the SAME count both panels of
// `/app/leaderboard` print, so the ranking reads the scoreboard's rows instead of
// re-deriving them. Two aggregations over one season is how the two screens
// would eventually disagree about it.
//
// The rules, straight from the glossary:
//   - only CONFIRMED lineups count (already true of `SeasonStats.rows`),
//   - every active moreškant is a row, at zero as much as at twenty,
//   - equal counts SHARE a rank and the next rank skips (1, 1, 3): a season is
//     not a race with a photo finish, and inventing an order inside a tie would
//     make up a fact the lineups do not contain,
//   - milestones are read off the same count, "puna sezona" means every
//     confirmed evening of the season,
//   - no streaks, ever.

import type { SeasonStats } from './stats-loaders'

/** The four milestones, in order (glossary: *Ljestvica*). */
export const MILESTONES = [5, 10, 15, 20] as const

/** The two panels of `/app/leaderboard` (#457, renamed by #473). */
export const LEADERBOARD_SEGMENTS = ['mine', 'all'] as const

export type LeaderboardSegment = (typeof LEADERBOARD_SEGMENTS)[number]

/**
 * Which panel `?part=` asks for, defaulting to the dancer's own season.
 *
 * Anything unrecognised opens on "mine" rather than erroring: a stale link is
 * still a link to the screen, and `?dio=moja` from before #495 lands there too.
 */
export function parseLeaderboardSegment(raw: string | undefined | null): LeaderboardSegment {
  return LEADERBOARD_SEGMENTS.includes(raw as LeaderboardSegment)
    ? (raw as LeaderboardSegment)
    : 'mine'
}

export interface LeaderboardRow {
  /** Competition rank: equal counts share it, the next one skips. */
  rank: number
  memberId: string
  nickname: string
  performances: number
  /** 0..1 of the season's confirmed evenings; 0 when there are none. */
  share: number
  /** Danced every confirmed evening of the season (and there was at least one). */
  fullSeason: boolean
  /** The milestones already reached, a subset of MILESTONES in order. */
  milestones: number[]
  /** The viewer's own row. */
  me: boolean
}

export interface LeaderboardMe {
  rank: number
  performances: number
  /**
   * How many more performances would reach the next higher distinct count, so
   * the sentence can say what the gap actually is. Null at the top, and null
   * for a dancer at zero in a season where nobody has danced.
   */
  toNextPlace: number | null
  /**
   * The rank those performances would actually reach: the rank of the dancers
   * already at that count, because reaching it TIES them and a tie shares a
   * rank (#457 review). Not `rank - 1`, which is a rank nobody may hold — with
   * ranks 1, 1, 3 the dancer at 3 reaches 1, never 2. Null whenever
   * `toNextPlace` is.
   */
  nextPlace: number | null
  nextMilestone: number | null
  toNextMilestone: number | null
}

export interface Leaderboard {
  rows: LeaderboardRow[]
  me: LeaderboardMe | null
  /** The top count; 0 for an empty season. */
  leader: number
  confirmedPerformances: number
  season: number
  seasons: number[]
}

/**
 * The season's table, ranked.
 *
 * `myMemberId` may be null (a voditelj who does not dance): the board still
 * renders, it simply has no card at the top, because the honest answer for
 * somebody who is not on the roster is "here is everyone else".
 */
export function buildLeaderboard(input: {
  stats: SeasonStats
  myMemberId: string | null
}): Leaderboard {
  const { stats } = input
  const confirmedPerformances = stats.confirmedPerformances
  const mine = input.myMemberId == null ? null : String(input.myMemberId)

  // The rows arrive sorted by performances desc, then nickname: the order is
  // the scoreboard's and is never re-sorted here, so the two screens list the
  // society in the same order.
  const rows: LeaderboardRow[] = []
  let rank = 0
  let previous: number | null = null

  stats.rows.forEach((row, index) => {
    if (previous === null || row.performances !== previous) {
      rank = index + 1
      previous = row.performances
    }
    rows.push({
      rank,
      memberId: String(row.memberId),
      nickname: row.nickname,
      performances: row.performances,
      share:
        confirmedPerformances > 0
          ? Math.min(1, row.performances / confirmedPerformances)
          : 0,
      fullSeason: confirmedPerformances > 0 && row.performances === confirmedPerformances,
      milestones: MILESTONES.filter((m) => row.performances >= m),
      me: mine !== null && String(row.memberId) === mine,
    })
  })

  const myRow = rows.find((r) => r.me) ?? null

  let me: LeaderboardMe | null = null
  if (myRow) {
    // The distinct counts above mine, smallest first: reaching the nearest one
    // ties that dancer, and a tie shares their rank.
    const higher = [...new Set(rows.map((r) => r.performances))]
      .filter((count) => count > myRow.performances)
      .sort((a, b) => a - b)
    const nextMilestone = MILESTONES.find((m) => m > myRow.performances) ?? null
    const nextCount = myRow.rank === 1 || higher.length === 0 ? null : higher[0]
    // The rank that count already holds, which is the rank reaching it earns.
    const nextPlace =
      nextCount === null ? null : (rows.find((r) => r.performances === nextCount)?.rank ?? null)

    me = {
      rank: myRow.rank,
      performances: myRow.performances,
      toNextPlace: nextCount === null ? null : nextCount - myRow.performances,
      nextPlace,
      nextMilestone,
      toNextMilestone: nextMilestone === null ? null : nextMilestone - myRow.performances,
    }
  }

  return {
    rows,
    me,
    leader: rows[0]?.performances ?? 0,
    confirmedPerformances,
    season: stats.season,
    seasons: [...stats.seasons],
  }
}
