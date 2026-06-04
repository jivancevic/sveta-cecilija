import { describe, it, expect } from 'vitest'
import { toDashboardShows } from './from-stats'
import type { StatsShow } from '../stats'

function makeStatsShow(overrides: Partial<StatsShow> = {}): StatsShow {
  return {
    id: 's1',
    date: '2026-07-01',
    time: '21:00',
    venue: 'ljetno-kino',
    activeTicketCount: 0,
    inPersonSold: 0,
    legacyReserved: 0,
    scannedCount: 0,
    status: 'active',
    ...overrides,
  }
}

describe('toDashboardShows', () => {
  it('folds active tickets + in-person into sold and derives capacity + remaining per venue', () => {
    const [show] = toDashboardShows([
      makeStatsShow({ venue: 'ljetno-kino', activeTicketCount: 100, inPersonSold: 20, legacyReserved: 0 }),
    ])
    expect(show.sold).toBe(120)
    expect(show.capacity).toBe(320)
    expect(show.remaining).toBe(200) // 320 - 100 - 20 - 0
  })

  it('subtracts legacyReserved from remaining but not from sold', () => {
    const [show] = toDashboardShows([
      makeStatsShow({ venue: 'zimsko-kino', activeTicketCount: 10, inPersonSold: 0, legacyReserved: 40 }),
    ])
    expect(show.sold).toBe(10)
    expect(show.capacity).toBe(250)
    expect(show.remaining).toBe(200) // 250 - 10 - 0 - 40
  })

  it('carries date, time, venue and status through unchanged', () => {
    const [show] = toDashboardShows([
      makeStatsShow({ id: 'x', date: '2026-08-09', time: '21:00', status: 'cancelled' }),
    ])
    expect(show).toMatchObject({ id: 'x', date: '2026-08-09', time: '21:00', status: 'cancelled' })
  })
})
