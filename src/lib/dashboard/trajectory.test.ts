import { describe, it, expect } from 'vitest'
import { seasonTrajectory } from './trajectory'
import type { DashboardShow } from './partition'
import type { ShowChannelCounts } from '../tickets/sold-seats'

function show(over: Partial<DashboardShow> = {}): DashboardShow {
  return {
    id: '1',
    date: '2026-07-12',
    time: '21:30',
    venue: 'ljetno-kino',
    sold: 100,
    capacity: 350,
    remaining: 250,
    status: 'active',
    ...over,
  }
}

const noChannels = new Map<string, ShowChannelCounts>()

function channels(entries: Record<string, Partial<ShowChannelCounts>>) {
  return new Map<string, ShowChannelCounts>(
    Object.entries(entries).map(([id, c]) => [id, { online: 0, partner: 0, comp: 0, ...c }]),
  )
}

/** Segment counts in display order: online, at the door, partner, comp. */
function counts(bar: { segments: { count: number }[] }) {
  return bar.segments.map((s) => s.count)
}

describe('seasonTrajectory', () => {
  it('returns an empty series and zero scale for no shows', () => {
    expect(seasonTrajectory([], noChannels)).toEqual({ bars: [], maxCapacity: 0 })
  })

  it('orders bars chronologically regardless of input order', () => {
    const { bars } = seasonTrajectory(
      [
        show({ id: 'c', date: '2026-08-01' }),
        show({ id: 'a', date: '2026-06-08' }),
        show({ id: 'b', date: '2026-07-12' }),
      ],
      noChannels,
    )
    expect(bars.map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('derives a sold/capacity percent clamped to 0..100', () => {
    const { bars } = seasonTrajectory(
      [
        show({ id: '1', sold: 175, capacity: 350 }), // 50%
        show({ id: '2', sold: 400, capacity: 350 }), // oversold -> clamped 100
        show({ id: '3', sold: 0, capacity: 0 }), // guard against /0
      ],
      noChannels,
    )
    expect(bars.map((b) => b.percent)).toEqual([50, 100, 0])
  })

  it('exposes the season-wide max capacity for a shared y-scale', () => {
    const { maxCapacity } = seasonTrajectory(
      [show({ venue: 'zimsko-kino', capacity: 250 }), show({ venue: 'ljetno-kino', capacity: 350 })],
      noChannels,
    )
    expect(maxCapacity).toBe(350)
  })

  it('flags cancelled shows and carries through display fields', () => {
    const { bars } = seasonTrajectory(
      [show({ id: '9', status: 'cancelled', sold: 0, time: '20:00', venue: 'zimsko-kino' })],
      noChannels,
    )
    expect(bars[0]).toMatchObject({
      id: '9',
      cancelled: true,
      time: '20:00',
      venue: 'zimsko-kino',
    })
  })

  it('splits a bar into online, at-the-door, partner and comp segments', () => {
    const { bars } = seasonTrajectory(
      [show({ id: '7', sold: 100 })],
      channels({ '7': { online: 60, partner: 12, comp: 3 } }),
    )
    expect(bars[0].segments.map((s) => s.key)).toEqual(['online', 'inPerson', 'partner', 'comp'])
    expect(counts(bars[0])).toEqual([60, 25, 12, 3]) // at the door = the remainder
  })

  it('always sums the segments back to the show card sold figure', () => {
    const { bars } = seasonTrajectory(
      [show({ id: '7', sold: 123 })],
      channels({ '7': { online: 41, partner: 9, comp: 2 } }),
    )
    expect(bars[0].segments.reduce((n, s) => n + s.count, 0)).toBe(123)
  })

  it('treats a show with no ticket rows as sold entirely at the door', () => {
    const { bars } = seasonTrajectory([show({ id: '7', sold: 48 })], noChannels)
    expect(counts(bars[0])).toEqual([0, 48, 0, 0])
  })

  it('never draws a negative at-the-door segment when the counters disagree', () => {
    const { bars } = seasonTrajectory(
      [show({ id: '7', sold: 10 })],
      channels({ '7': { online: 40 } }),
    )
    expect(counts(bars[0])).toEqual([40, 0, 0, 0])
  })

  it('reports every channel as zero for a show that has sold nothing', () => {
    const { bars } = seasonTrajectory([show({ id: '7', sold: 0 })], noChannels)
    expect(counts(bars[0])).toEqual([0, 0, 0, 0])
  })
})
