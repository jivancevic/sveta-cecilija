import { describe, it, expect } from 'vitest'
import { computeSeasonStats, type StatsTicketRow } from './partner-stats'

function row(over: Partial<StatsTicketRow> = {}): StatsTicketRow {
  return { showId: '1', showLabel: '2026-07-12 · Ljetno kino', type: 'adult', status: 'active', ...over }
}

describe('computeSeasonStats', () => {
  it('totals active tickets and breaks them down per show by type', () => {
    const rows = [
      row({ showId: '1', type: 'adult' }),
      row({ showId: '1', type: 'child' }),
      row({ showId: '2', showLabel: '2026-08-01 · Centar za kulturu', type: 'adult' }),
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

  it('sorts per-show lines by label and is empty for no active rows', () => {
    expect(computeSeasonStats([]).perShow).toHaveLength(0)
    const rows = [
      row({ showId: '2', showLabel: 'B show' }),
      row({ showId: '1', showLabel: 'A show' }),
    ]
    const s = computeSeasonStats(rows)
    expect(s.perShow.map((p) => p.showLabel)).toEqual(['A show', 'B show'])
  })
})
