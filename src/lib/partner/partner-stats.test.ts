import { describe, it, expect } from 'vitest'
import { buildStatistikaBars, computeSeasonStats, type PerShowCount, type StatsTicketRow } from './partner-stats'

function row(over: Partial<StatsTicketRow> = {}): StatsTicketRow {
  return {
    showId: '1',
    showLabel: '2026-07-12 · Ljetno kino',
    showDate: '2026-07-12',
    type: 'adult',
    status: 'active',
    ...over,
  }
}

describe('computeSeasonStats', () => {
  it('totals active tickets and breaks them down per show by type', () => {
    const rows = [
      row({ showId: '1', type: 'adult' }),
      row({ showId: '1', type: 'child' }),
      row({ showId: '2', showLabel: '2026-08-01 · Centar za kulturu', showDate: '2026-08-01', type: 'adult' }),
    ]
    const s = computeSeasonStats(rows)
    expect(s.totalActive).toBe(3)
    expect(s.perShow).toHaveLength(2)
    expect(s.perShow[0]).toMatchObject({ showId: '1', adults: 1, children: 1, total: 2 })
    expect(s.perShow[1]).toMatchObject({ showId: '2', adults: 1, children: 0, total: 1 })
  })

  it('excludes cancelled tickets from the seat counts', () => {
    const rows = [
      row({ status: 'active' }),
      row({ status: 'cancelled' }),
      row({ status: 'cancelled' }),
    ]
    const s = computeSeasonStats(rows)
    expect(s.totalActive).toBe(1)
    expect(s.perShow[0].total).toBe(1)
  })

  it('sorts per-show lines chronologically by show date and is empty for no active rows', () => {
    expect(computeSeasonStats([]).perShow).toHaveLength(0)
    const rows = [
      row({ showId: '2', showLabel: 'B show', showDate: '2026-08-01' }),
      row({ showId: '1', showLabel: 'A show', showDate: '2026-07-12' }),
    ]
    const s = computeSeasonStats(rows)
    expect(s.perShow.map((p) => p.showLabel)).toEqual(['A show', 'B show'])
  })
})

describe('buildStatistikaBars', () => {
  const sold: PerShowCount[] = [
    { showId: '2', showLabel: '', showDate: '2026-08-01', adults: 3, children: 1, total: 4 },
  ]

  it('shows ALL season performances chronologically, 0 where none were sold', () => {
    const allShows = [
      { showId: '3', showDate: '2026-09-15' },
      { showId: '1', showDate: '2026-07-12' },
      { showId: '2', showDate: '2026-08-01' },
    ]
    const bars = buildStatistikaBars(allShows, sold)
    expect(bars.map((b) => b.showId)).toEqual(['1', '2', '3']) // chronological
    expect(bars[0]).toMatchObject({ showId: '1', adults: 0, children: 0, total: 0 })
    expect(bars[1]).toMatchObject({ showId: '2', adults: 3, children: 1, total: 4 })
    expect(bars[2]).toMatchObject({ showId: '3', adults: 0, children: 0, total: 0 })
  })
})
