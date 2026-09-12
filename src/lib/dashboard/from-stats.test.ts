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
    expect(show.capacity).toBe(350)
    expect(show.remaining).toBe(230) // 350 - 100 - 20 - 0
  })

  it('counts legacyReserved as sold and subtracts it from remaining', () => {
    // ADR-0025: the old site's seats were completed, paid sales on a system that
    // is now closed, not reservations. Excluding them here disagreed with the
    // member dashboard and hid 137 real 2026 attendees.
    const [show] = toDashboardShows([
      makeStatsShow({ venue: 'zimsko-kino', activeTicketCount: 10, inPersonSold: 0, legacyReserved: 40 }),
    ])
    expect(show.sold).toBe(50)
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
