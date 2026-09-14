// The two rings of a season profile (#608).
//
// Pure and shared, because the profile has two entry points — `/app/leaderboard/
// [memberId]` and the Moja sezona panel — and a ring computed twice is two
// numbers for one season waiting to disagree.
//
// **Always both rings**, even for a dancer with no Experience at all: a zero
// ring reads as zero, while a missing card reads as a screen that failed to
// load. The rank inside it is null in that case rather than a number, because a
// place among people who danced is not a place this dancer holds.

import { PROFILE_LISTS } from './dancer-season'
import {
  kindsOf,
  listIsRanked,
  rankDancers,
  roleTallies,
  type LeaderboardKind,
} from './leaderboard-rank'
import type { SeasonStats } from './stats-loaders'
import type { MARK_OF_ROLE } from './leaderboard-rank'

export interface ProfileRingData {
  kind: LeaderboardKind
  count: number
  /** The season's confirmed evenings of this kind: what the ring fills against. */
  of: number
  rank: number | null
  total: number
  tallies: { role: keyof typeof MARK_OF_ROLE; count: number }[]
  animate: boolean
  /**
   * Whether this list is ranked at all this season (#614).
   *
   * A season whose best Experience score is 2 hands out "3. mjesto od 70" for a
   * single morning, which is a true sentence and a false message — and it is
   * the same place, drawn the same way, as a season of twenty-one moreške on
   * the card beside it. Under the floor the profile prints the COUNT and no
   * place at all.
   */
  ranked: boolean
}

/**
 * Both lists, for one dancer.
 *
 * The counts and the ranks come off the SAME `rankDancers` the board uses, so a
 * profile can never print a place the list next to it disagrees with. `animate`
 * is the reader's own: a count that runs up is a small celebration, and
 * celebrating somebody else's number at them is not what it is for.
 */
export function profileRings(input: {
  stats: SeasonStats
  memberId: string
  mine: boolean
}): ProfileRingData[] {
  return PROFILE_LISTS.map((kind) => {
    const of = kindsOf(kind).reduce((sum, k) => sum + input.stats.confirmedByKind[k], 0)
    const ranked = rankDancers({
      rows: input.stats.rows,
      kind,
      primaryRoles: input.stats.primaryRoles,
      initials: input.stats.initials,
      myMemberId: input.memberId,
      confirmed: of,
    })
    const row = ranked.find((r) => r.memberId === String(input.memberId)) ?? null
    const source = input.stats.rows.find((r) => String(r.memberId) === String(input.memberId))
    const isRanked = listIsRanked(kind, ranked)

    return {
      kind,
      count: row?.performances ?? 0,
      of,
      // A dancer with nothing of this kind holds no place among those who have,
      // and neither does anybody on a list too small to be ranked at all.
      rank: isRanked && row && row.performances > 0 ? row.rank : null,
      ranked: isRanked,
      total: ranked.length,
      tallies: source ? roleTallies(source, kind) : [],
      animate: input.mine,
    }
  })
}
