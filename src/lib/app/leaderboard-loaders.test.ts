import { describe, expect, it } from 'vitest'
import { PERFORMANCE_KINDS, type PerformanceKind } from '@/lib/show-performance'
import { STAT_ROLES, type DancerStats, type StatRole } from '@/lib/lineup/stats'
import type { SeasonStats } from './stats-loaders'
import { buildLeaderboard, parseMojeSegment } from './leaderboard-loaders'

function dancer(memberId: string, nickname: string, performances: number): DancerStats {
  return {
    memberId,
    nickname,
    performances,
    roles: Object.fromEntries(STAT_ROLES.map((r) => [r, 0])) as Record<StatRole, number>,
    byKind: Object.fromEntries(PERFORMANCE_KINDS.map((k) => [k, 0])) as Record<
      PerformanceKind,
      number
    >,
  }
}

function stats(rows: DancerStats[], confirmedPerformances: number): SeasonStats {
  return { season: 2026, seasons: [2026, 2025], rows, confirmedPerformances }
}

describe('parseMojeSegment', () => {
  it('opens on the dancer own season by default', () => {
    expect(parseMojeSegment(undefined)).toBe('moja')
    expect(parseMojeSegment('nesto')).toBe('moja')
  })

  it('opens on the board when the URL asks for it', () => {
    expect(parseMojeSegment('ljestvica')).toBe('ljestvica')
  })
})

describe('buildLeaderboard', () => {
  it('shares a rank between equal counts and skips the next one', () => {
    const board = buildLeaderboard({
      stats: stats(
        [dancer('1', 'Ante', 12), dancer('2', 'Bepo', 12), dancer('3', 'Cico', 7)],
        20,
      ),
      myMemberId: null,
    })
    expect(board.rows.map((r) => r.rank)).toEqual([1, 1, 3])
    expect(board.leader).toBe(12)
  })

  it('keeps the order it is handed and marks the viewer own row', () => {
    const board = buildLeaderboard({
      stats: stats([dancer('1', 'Ante', 9), dancer('2', 'Bepo', 4)], 10),
      myMemberId: '2',
    })
    expect(board.rows.map((r) => r.nickname)).toEqual(['Ante', 'Bepo'])
    expect(board.rows.map((r) => r.me)).toEqual([false, true])
    expect(board.me).toEqual({
      rank: 2,
      performances: 4,
      toNextPlace: 5,
      nextMilestone: 5,
      toNextMilestone: 1,
    })
  })

  it('counts the share and the full season against the confirmed evenings', () => {
    const board = buildLeaderboard({
      stats: stats([dancer('1', 'Ante', 8), dancer('2', 'Bepo', 2)], 8),
      myMemberId: null,
    })
    expect(board.rows[0].share).toBe(1)
    expect(board.rows[0].fullSeason).toBe(true)
    expect(board.rows[1].share).toBeCloseTo(0.25)
    expect(board.rows[1].fullSeason).toBe(false)
  })

  it('reads the milestones off the same count', () => {
    const board = buildLeaderboard({
      stats: stats([dancer('1', 'Ante', 16), dancer('2', 'Bepo', 4)], 22),
      myMemberId: '1',
    })
    expect(board.rows[0].milestones).toEqual([5, 10, 15])
    expect(board.rows[1].milestones).toEqual([])
    expect(board.me?.nextMilestone).toBe(20)
    expect(board.me?.toNextMilestone).toBe(4)
  })

  it('has no next place and no next milestone at the very top', () => {
    const board = buildLeaderboard({
      stats: stats([dancer('1', 'Ante', 20), dancer('2', 'Bepo', 3)], 20),
      myMemberId: '1',
    })
    expect(board.me?.toNextPlace).toBeNull()
    expect(board.me?.nextMilestone).toBeNull()
    expect(board.me?.toNextMilestone).toBeNull()
  })

  it('has no next place when the whole society is still at zero', () => {
    const board = buildLeaderboard({
      stats: stats([dancer('1', 'Ante', 0), dancer('2', 'Bepo', 0)], 0),
      myMemberId: '2',
    })
    expect(board.rows.map((r) => r.rank)).toEqual([1, 1])
    expect(board.rows.every((r) => r.share === 0 && !r.fullSeason)).toBe(true)
    expect(board.me?.toNextPlace).toBeNull()
    expect(board.confirmedPerformances).toBe(0)
  })

  it('renders without a card when the viewer is not on the roster', () => {
    const board = buildLeaderboard({
      stats: stats([dancer('1', 'Ante', 5)], 6),
      myMemberId: '99',
    })
    expect(board.me).toBeNull()
    expect(board.rows).toHaveLength(1)
  })

  it('survives an empty roster', () => {
    const board = buildLeaderboard({ stats: stats([], 0), myMemberId: '1' })
    expect(board.rows).toEqual([])
    expect(board.leader).toBe(0)
    expect(board.me).toBeNull()
  })
})
