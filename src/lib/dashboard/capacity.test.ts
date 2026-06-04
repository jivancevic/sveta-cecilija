import { describe, it, expect } from 'vitest'
import { showFill, seasonCapacity, type DashboardShow } from './capacity'

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

describe('showFill', () => {
  it('reports sold, capacity, remaining and the fill percent', () => {
    const fill = showFill(makeShow({ sold: 160, capacity: 320, remaining: 160 }))
    expect(fill.sold).toBe(160)
    expect(fill.capacity).toBe(320)
    expect(fill.remaining).toBe(160)
    expect(fill.percent).toBe(50)
  })

  it('rounds the fill percent to a whole number', () => {
    // 100 / 320 = 31.25% -> 31
    expect(showFill(makeShow({ sold: 100, capacity: 320 })).percent).toBe(31)
  })

  it('clamps the fill percent to 100 even if a show is oversold', () => {
    const fill = showFill(makeShow({ sold: 340, capacity: 320, remaining: -20 }))
    expect(fill.percent).toBe(100)
  })

  it('never reports a negative percent and is 0 for an empty show', () => {
    expect(showFill(makeShow({ sold: 0, capacity: 320 })).percent).toBe(0)
  })

  it('treats a zero-capacity show as 0% rather than dividing by zero', () => {
    expect(showFill(makeShow({ sold: 5, capacity: 0 })).percent).toBe(0)
  })
})

describe('seasonCapacity', () => {
  it('sums sold and capacity across all shows and reports % of season capacity', () => {
    const out = seasonCapacity([
      makeShow({ sold: 160, capacity: 320 }),
      makeShow({ sold: 50, capacity: 250 }),
    ])
    expect(out.totalSold).toBe(210)
    expect(out.totalCapacity).toBe(570)
    // 210 / 570 = 36.84% -> 37
    expect(out.percent).toBe(37)
  })

  it('excludes cancelled shows from the season capacity denominator', () => {
    const out = seasonCapacity([
      makeShow({ sold: 100, capacity: 320, status: 'active' }),
      makeShow({ sold: 0, capacity: 320, status: 'cancelled' }),
    ])
    expect(out.totalCapacity).toBe(320)
    expect(out.totalSold).toBe(100)
  })

  it('is 0% for an empty or all-cancelled season (no divide by zero)', () => {
    expect(seasonCapacity([]).percent).toBe(0)
    expect(seasonCapacity([makeShow({ capacity: 320, status: 'cancelled' })]).percent).toBe(0)
  })

  it('clamps season percent to 100 if somehow oversold', () => {
    const out = seasonCapacity([makeShow({ sold: 400, capacity: 320 })])
    expect(out.percent).toBe(100)
  })
})
