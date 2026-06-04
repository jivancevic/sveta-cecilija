import { describe, it, expect } from 'vitest'
import { seasonTrajectory } from './trajectory'
import type { DashboardShow } from './partition'

function show(over: Partial<DashboardShow> = {}): DashboardShow {
  return {
    id: '1',
    date: '2026-07-12',
    time: '21:30',
    venue: 'ljetno-kino',
    sold: 100,
    capacity: 320,
    remaining: 220,
    status: 'active',
    ...over,
  }
}

describe('seasonTrajectory', () => {
  it('returns an empty series and zero scale for no shows', () => {
    expect(seasonTrajectory([])).toEqual({ bars: [], maxCapacity: 0 })
  })

  it('orders bars chronologically regardless of input order', () => {
    const { bars } = seasonTrajectory([
      show({ id: 'c', date: '2026-08-01' }),
      show({ id: 'a', date: '2026-06-08' }),
      show({ id: 'b', date: '2026-07-12' }),
    ])
    expect(bars.map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('derives a sold/capacity percent clamped to 0..100', () => {
    const { bars } = seasonTrajectory([
      show({ id: '1', sold: 160, capacity: 320 }), // 50%
      show({ id: '2', sold: 400, capacity: 320 }), // oversold -> clamped 100
      show({ id: '3', sold: 0, capacity: 0 }), // guard against /0
    ])
    expect(bars.map((b) => b.percent)).toEqual([50, 100, 0])
  })

  it('exposes the season-wide max capacity for a shared y-scale', () => {
    const { maxCapacity } = seasonTrajectory([
      show({ venue: 'zimsko-kino', capacity: 250 }),
      show({ venue: 'ljetno-kino', capacity: 320 }),
    ])
    expect(maxCapacity).toBe(320)
  })

  it('flags cancelled shows and carries through display fields', () => {
    const { bars } = seasonTrajectory([
      show({ id: '9', status: 'cancelled', sold: 0, time: '20:00', venue: 'zimsko-kino' }),
    ])
    expect(bars[0]).toMatchObject({
      id: '9',
      cancelled: true,
      time: '20:00',
      venue: 'zimsko-kino',
    })
  })
})
