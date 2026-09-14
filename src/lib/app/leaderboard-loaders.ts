// Which panel of `/app/leaderboard` is open (#457, renamed by #473).
//
// This module used to hold the board itself — `buildLeaderboard`, a whole-season
// ranking with milestones hanging off it. Both are gone (#607): #568 had already
// split the season into two ranked lists in `leaderboard-rank.ts`, which left
// this ranking used for nothing but the prekretnice, and the prekretnice were
// deleted because 5, 10, 15 and 20 are four numbers that mean nothing beyond
// themselves. Badges come back when the uprava has decided what is worth one.
//
// What remains is the segment: which of the two panels the URL asks for.

/**
 * The two panels of `/app/leaderboard`, in the order they are read.
 *
 * **Ljestvica first since #568** (decision Q36). The screen is called Ljestvica
 * and a tab that opens on something else than its own name asks the reader to
 * find it; "Moja sezona" is the second thing a dancer looks at, after where
 * they stand.
 */
export const LEADERBOARD_SEGMENTS = ['all', 'mine'] as const

export type LeaderboardSegment = (typeof LEADERBOARD_SEGMENTS)[number]

/**
 * Which panel `?part=` asks for, defaulting to the board.
 *
 * Anything unrecognised opens on "all" rather than erroring: a stale link is
 * still a link to the screen.
 */
export function parseLeaderboardSegment(raw: string | undefined | null): LeaderboardSegment {
  return LEADERBOARD_SEGMENTS.includes(raw as LeaderboardSegment)
    ? (raw as LeaderboardSegment)
    : 'all'
}
