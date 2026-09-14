import { describe, expect, it } from 'vitest'
import { parseLeaderboardSegment } from './leaderboard-loaders'

// What is left of this file after #607: the segment, and nothing else.
//
// It used to test `buildLeaderboard`, a whole-season ranking whose only
// remaining reader was the prekretnice. #568 had already split the season into
// two ranked lists in `leaderboard-rank.ts`, and #607 deleted the prekretnice,
// so the function was ranking a season nothing displayed. Its rules did not
// move house — they were already tested next door, over the lists the screen
// actually draws.

describe('parseLeaderboardSegment', () => {
  it('opens on the board by default, because the screen is called Ljestvica', () => {
    expect(parseLeaderboardSegment(undefined)).toBe('all')
    expect(parseLeaderboardSegment('nesto')).toBe('all')
  })

  it('opens on the dancer own season when the URL asks for it', () => {
    expect(parseLeaderboardSegment('mine')).toBe('mine')
  })
})
