import { describe, expect, it } from 'vitest'
import { buildStatsScreen, type StatsScreenInput } from './stats-screen'

// Statistika (#508). The worked example below is one small season, and every
// expected number in this file is written out by hand from it rather than
// recomputed the way the module does.
//
//   A · 12.07. · Ljetno kino (350) — online 100, partner 20, gratis 10,
//                                    vrata 30 (20 odrasli + 10 djece),
//                                    ušlo 90   → prodano 160
//   B · 20.07. · Centar za kulturu (250) — online 50 → prodano 50
//   C · 25.07. · Ljetno kino, OTKAZANA — online 40
//
// Season band: 160 + 50 = 210 seats of 350 + 250 = 600 → 35%. The cancelled
// evening contributes nothing to either figure, which is the rule
// `seasonCapacity` has always applied on the Backoffice dashboard.

function input(overrides: Partial<StatsScreenInput> = {}): StatsScreenInput {
  return {
    season: 2026,
    seasons: [2026, 2025],
    shows: [
      { id: 'a', date: '2026-07-12', time: '21:30', venue: 'ljetno-kino', cancelled: false },
      { id: 'b', date: '2026-07-20', time: '21:00', venue: 'zimsko-kino', cancelled: false },
      { id: 'c', date: '2026-07-25', time: '21:30', venue: 'ljetno-kino', cancelled: true },
    ],
    tickets: new Map([
      ['a', { showId: 'a', adult: 100, child: 30, online: 100, partner: 20, comp: 10 }],
      ['b', { showId: 'b', adult: 40, child: 10, online: 50, partner: 0, comp: 0 }],
      ['c', { showId: 'c', adult: 40, child: 0, online: 40, partner: 0, comp: 0 }],
    ]),
    offline: new Map([['a', { adult: 20, child: 10, seats: 30 }]]),
    scanned: new Map([['a', 90]]),
    comps: [],
    canOpenPerformances: true,
    canSeeComps: true,
    ...overrides,
  }
}

describe('the season band', () => {
  it('counts seats, comps, capacity and fill across the season', () => {
    const { band } = buildStatsScreen(input())

    expect(band.sold).toBe(210)
    expect(band.comps).toBe(10)
    expect(band.capacity).toBe(600)
    expect(band.percent).toBe(35)
  })

  it('leaves a cancelled evening out of every season figure', () => {
    // Without the rule the band would read 250 of 950 (26%): the 40 online
    // seats of the cancelled evening plus its 350 seats of capacity.
    const { band } = buildStatsScreen(input())
    expect(band.sold).not.toBe(250)
    expect(band.capacity).not.toBe(950)
  })

  it('is 0% rather than NaN when the season has no performances', () => {
    const { band, rows } = buildStatsScreen(
      input({ shows: [], tickets: new Map(), offline: new Map(), scanned: new Map() }),
    )
    expect(rows).toEqual([])
    expect(band).toEqual({ sold: 0, comps: 0, capacity: 0, percent: 0 })
  })
})

describe('one performance row', () => {
  it('splits the evening into its four channels and its two ticket types', () => {
    const [a] = buildStatsScreen(input()).rows

    expect(a.soldOf).toBe('160/350')
    expect(a.sold).toBe(160)
    expect(a.percent).toBe(46) // 160/350 = 45.71%
    expect(a.adult).toBe(120) // 100 ticketed + 20 at the door
    expect(a.child).toBe(40) // 30 ticketed + 10 at the door
    expect(a.channels).toEqual({ online: 100, door: 30, partner: 20, comp: 10 })
    expect(a.scanned).toBe(90)
  })

  it('adds the four channels up to exactly what the row says was sold', () => {
    for (const row of buildStatsScreen(input()).rows) {
      const { online, door, partner, comp } = row.channels
      expect(online + door + partner + comp).toBe(row.sold)
      expect(row.adult + row.child).toBe(row.sold)
    }
  })

  it('lists a cancelled evening, flagged, instead of hiding it', () => {
    const rows = buildStatsScreen(input()).rows
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(rows[2].cancelled).toBe(true)
  })

  it('reads an evening with nothing sold as zeros, never as a missing row', () => {
    const { rows } = buildStatsScreen(
      input({ tickets: new Map(), offline: new Map(), scanned: new Map() }),
    )
    expect(rows[0].sold).toBe(0)
    expect(rows[0].percent).toBe(0)
    expect(rows[0].channels).toEqual({ online: 0, door: 0, partner: 0, comp: 0 })
  })

  it('names the day and the house in Croatian', () => {
    const [a, b] = buildStatsScreen(input()).rows
    expect(a.dateLabel).toBe('12. srp')
    expect(a.venueLabel).toBe('Ljetno kino')
    expect(b.venueLabel).toBe('Centar za kulturu')
  })

  it('sorts the season chronologically whatever order the rows arrive in', () => {
    const shuffled = input()
    shuffled.shows = [shuffled.shows[2], shuffled.shows[0], shuffled.shows[1]]
    expect(buildStatsScreen(shuffled).rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('the link into Izvedbe', () => {
  it('links every row when the viewer unlocks Izvedbe', () => {
    const rows = buildStatsScreen(input()).rows
    expect(rows.map((r) => r.href)).toEqual([
      '/app/performances/a',
      '/app/performances/b',
      '/app/performances/c',
    ])
  })

  it('gives a season_stats-only reader no link at all', () => {
    // The shared `member` login unlocks Statistika and nothing else, so a link
    // into Izvedbe would be a row that refuses itself on tap.
    const rows = buildStatsScreen(input({ canOpenPerformances: false })).rows
    expect(rows.every((r) => r.href === null)).toBe(true)
  })
})

describe('the two charts', () => {
  it('gives the trajectory one bar per evening on a shared capacity scale', () => {
    const { trajectory } = buildStatsScreen(input())

    expect(trajectory.maxCapacity).toBe(350)
    expect(trajectory.bars.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(trajectory.bars[0].segments).toEqual([
      { key: 'online', count: 100 },
      { key: 'inPerson', count: 30 },
      { key: 'partner', count: 20 },
      { key: 'comp', count: 10 },
    ])
    expect(trajectory.bars[2].cancelled).toBe(true)
  })

  it('mixes only the three SALES channels, and only the evenings that happened', () => {
    // 150 online + 30 at the door + 20 partner = 200. Gratis is a seat and
    // never a sale (ADR-0019), so it is in the band and not in this bar.
    const { mix } = buildStatsScreen(input())

    expect(mix.total).toBe(200)
    expect(mix.segments).toEqual([
      { key: 'online', count: 150, percent: 75 },
      { key: 'inPerson', count: 30, percent: 15 },
      { key: 'partner', count: 20, percent: 10 },
    ])
  })
})

describe('gratis po članu', () => {
  const comps = [
    { memberId: '3', memberName: 'Brane', adult: 4, child: 2, total: 6 },
    { memberId: '7', memberName: 'Cici', adult: 2, child: 0, total: 2 },
  ]

  it('is the table for a tickets holder', () => {
    expect(buildStatsScreen(input({ comps })).comps).toEqual(comps)
  })

  it('is absent, not empty, for a reader who may not see it', () => {
    // `null` rather than `[]`: the section is not rendered at all, so no
    // template can leak a member's name by forgetting a condition.
    expect(buildStatsScreen(input({ comps, canSeeComps: false })).comps).toBeNull()
  })
})

describe('the season picker', () => {
  it('carries the resolved season and the years to choose from', () => {
    const screen = buildStatsScreen(input())
    expect(screen.season).toBe(2026)
    expect(screen.seasons).toEqual([2026, 2025])
  })
})
