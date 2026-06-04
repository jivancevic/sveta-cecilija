import { describe, it, expect } from 'vitest'
import { partitionShows, type DashboardShow } from './partition'

function makeShow(overrides: Partial<DashboardShow> = {}): DashboardShow {
  return {
    id: 's1',
    date: '2026-07-01',
    time: '21:00',
    venue: 'ljetno-kino',
    sold: 0,
    capacity: 320,
    remaining: 320,
    status: 'active',
    ...overrides,
  }
}

describe('partitionShows', () => {
  const today = new Date('2026-07-10T12:00:00Z')

  it("puts today's show and future shows in upcoming, ascending by date", () => {
    const { upcoming } = partitionShows({
      today,
      shows: [
        makeShow({ id: 'future', date: '2026-07-15' }),
        makeShow({ id: 'today', date: '2026-07-10' }),
        makeShow({ id: 'soon', date: '2026-07-12' }),
      ],
    })
    expect(upcoming.map((s) => s.id)).toEqual(['today', 'soon', 'future'])
  })

  it('puts strictly-past shows in past, descending by date (most recent first)', () => {
    const { past } = partitionShows({
      today,
      shows: [
        makeShow({ id: 'old', date: '2026-06-01' }),
        makeShow({ id: 'recent', date: '2026-07-08' }),
        makeShow({ id: 'mid', date: '2026-07-01' }),
      ],
    })
    expect(past.map((s) => s.id)).toEqual(['recent', 'mid', 'old'])
  })

  it("treats today's date as upcoming, not past (compared at midnight)", () => {
    const { upcoming, past } = partitionShows({
      today,
      shows: [makeShow({ id: 'today', date: '2026-07-10' })],
    })
    expect(upcoming.map((s) => s.id)).toEqual(['today'])
    expect(past).toEqual([])
  })

  it('does not interleave: every past date is strictly before every upcoming date', () => {
    const { upcoming, past } = partitionShows({
      today,
      shows: [
        makeShow({ id: 'p1', date: '2026-07-09' }),
        makeShow({ id: 'u1', date: '2026-07-11' }),
        makeShow({ id: 'p2', date: '2026-07-05' }),
        makeShow({ id: 'u2', date: '2026-07-20' }),
      ],
    })
    expect(upcoming.every((u) => past.every((p) => p.date < u.date))).toBe(true)
  })

  it('handles an empty schedule', () => {
    expect(partitionShows({ today, shows: [] })).toEqual({ upcoming: [], past: [] })
  })
})
