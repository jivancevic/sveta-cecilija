import { describe, it, expect } from 'vitest'
import { computeStats, type StatsInput, type StatsShow } from './stats'

function makeShow(overrides: Partial<StatsShow> = {}): StatsShow {
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

function makeInput(overrides: Partial<StatsInput> = {}): StatsInput {
  return {
    today: new Date('2026-07-10T12:00:00Z'),
    shows: [],
    totalRevenueCents: 0,
    ...overrides,
  }
}

describe('computeStats — season header', () => {
  it('aggregates total tickets sold (online + in-person), scanned, and revenue across all shows', () => {
    const input = makeInput({
      totalRevenueCents: 123_45,
      shows: [
        makeShow({ id: 'a', venue: 'ljetno-kino', activeTicketCount: 100, inPersonSold: 20, scannedCount: 80 }),
        makeShow({ id: 'b', venue: 'zimsko-kino', activeTicketCount: 50, inPersonSold: 10, scannedCount: 30 }),
      ],
    })

    const out = computeStats(input)

    expect(out.header.totalSold).toBe(180)
    expect(out.header.totalScanned).toBe(110)
    expect(out.header.totalRevenueCents).toBe(123_45)
  })

  it('breaks header totals down by venue', () => {
    const input = makeInput({
      shows: [
        makeShow({ id: 'a', venue: 'ljetno-kino', activeTicketCount: 100, inPersonSold: 20, scannedCount: 80 }),
        makeShow({ id: 'b', venue: 'ljetno-kino', activeTicketCount: 10, inPersonSold: 0, scannedCount: 5 }),
        makeShow({ id: 'c', venue: 'zimsko-kino', activeTicketCount: 50, inPersonSold: 10, scannedCount: 30 }),
      ],
    })

    const out = computeStats(input)

    expect(out.header.byVenue['ljetno-kino']).toEqual({ sold: 130, scanned: 85 })
    expect(out.header.byVenue['zimsko-kino']).toEqual({ sold: 60, scanned: 30 })
  })

  it('row window includes shows from today-7d through future, excludes older, sorted by date asc', () => {
    const input = makeInput({
      today: new Date('2026-07-10T12:00:00Z'),
      shows: [
        makeShow({ id: 'too-old', date: '2026-07-02' }), // 8 days before — excluded
        makeShow({ id: 'edge', date: '2026-07-03' }),    // exactly 7 days before — included
        makeShow({ id: 'past-recent', date: '2026-07-08' }),
        makeShow({ id: 'today', date: '2026-07-10' }),
        makeShow({ id: 'future', date: '2026-07-15' }),
      ],
    })

    const out = computeStats(input)

    expect(out.rows.map((r) => r.id)).toEqual(['edge', 'past-recent', 'today', 'future'])
  })

  it('derives row capacity per venue and computes remaining = capacity − activeTicketCount − inPersonSold', () => {
    const input = makeInput({
      today: new Date('2026-07-10T12:00:00Z'),
      shows: [
        makeShow({ id: 'ljetno', date: '2026-07-12', venue: 'ljetno-kino', activeTicketCount: 100, inPersonSold: 20, scannedCount: 80 }),
        makeShow({ id: 'zimsko', date: '2026-07-13', venue: 'zimsko-kino', activeTicketCount: 50, inPersonSold: 0, scannedCount: 0 }),
      ],
    })

    const out = computeStats(input)
    const ljetno = out.rows.find((r) => r.id === 'ljetno')!
    const zimsko = out.rows.find((r) => r.id === 'zimsko')!

    expect(ljetno.capacity).toBe(320)
    expect(ljetno.remaining).toBe(200)
    expect(ljetno.scanned).toBe(80)
    expect(zimsko.capacity).toBe(250)
    expect(zimsko.remaining).toBe(200)
  })

  it('counts cancelled shows in the season header (they still represent activity)', () => {
    const input = makeInput({
      shows: [
        makeShow({ id: 'a', activeTicketCount: 10, inPersonSold: 0, scannedCount: 0, status: 'cancelled' }),
      ],
    })

    const out = computeStats(input)

    expect(out.header.totalSold).toBe(10)
  })
})
