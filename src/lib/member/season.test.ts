import { describe, it, expect } from 'vitest'
import { buildMemberSeason, seasonYear, type SeasonTicketRow } from './season'
import type { StatsShow } from '../stats'

function show(over: Partial<StatsShow> & { id: string; date: string }): StatsShow {
  return {
    time: '21:30',
    venue: 'ljetno-kino',
    activeTicketCount: 0,
    inPersonSold: 0,
    legacyReserved: 0,
    scannedCount: 0,
    status: 'active',
    ...over,
  }
}

function row(over: Partial<SeasonTicketRow> & { showId: string }): SeasonTicketRow {
  return { adult: 0, child: 0, online: 0, partner: 0, comp: 0, ...over }
}

describe('seasonYear', () => {
  it('is the calendar year of "today" in Europe/Zagreb', () => {
    expect(seasonYear(new Date('2026-07-15T12:00:00Z'))).toBe(2026)
  })

  it('uses Zagreb local time at the year boundary, not UTC', () => {
    // 2026-12-31T23:30Z is already 2027-01-01 00:30 in Zagreb (UTC+1).
    expect(seasonYear(new Date('2026-12-31T23:30:00Z'))).toBe(2027)
  })
})

describe('buildMemberSeason', () => {
  const today = new Date('2026-07-15T12:00:00Z')

  it('counts only performances in the current calendar year', () => {
    const result = buildMemberSeason({
      today,
      shows: [
        show({ id: '1', date: '2026-07-01', activeTicketCount: 100 }),
        show({ id: '2', date: '2025-07-01', activeTicketCount: 200 }), // last season
        show({ id: '3', date: '2027-07-01', activeTicketCount: 50 }), // next season
      ],
      ticketRows: [
        row({ showId: '1', adult: 80, child: 20, online: 100 }),
        row({ showId: '2', adult: 200, online: 200 }),
        row({ showId: '3', adult: 50, online: 50 }),
      ],
    })

    expect(result.year).toBe(2026)
    expect(result.issued).toBe(100)
    expect(result.shows.map((s) => s.showId)).toEqual(['1'])
    expect(result.types.adult).toBe(80)
    expect(result.types.child).toBe(20)
  })

  it('tolerates a full ISO timestamp as the show date', () => {
    const result = buildMemberSeason({
      today,
      shows: [show({ id: '1', date: '2026-07-01T19:00:00.000Z', activeTicketCount: 10 })],
      ticketRows: [],
    })
    expect(result.shows).toHaveLength(1)
    expect(result.shows[0].date).toBe('2026-07-01')
  })

  it('excludes cancelled performances from the list, the totals and the capacity', () => {
    const result = buildMemberSeason({
      today,
      shows: [
        show({ id: '1', date: '2026-07-01', activeTicketCount: 100 }),
        show({ id: '2', date: '2026-07-02', activeTicketCount: 40, status: 'cancelled' }),
      ],
      ticketRows: [
        row({ showId: '1', adult: 100, online: 100 }),
        row({ showId: '2', adult: 40, online: 40 }),
      ],
    })

    expect(result.shows.map((s) => s.showId)).toEqual(['1'])
    expect(result.issued).toBe(100)
    expect(result.capacity).toBe(320)
    expect(result.channels.online).toBe(100)
  })

  it('counts box office as inPersonSold + legacyReserved, both of which occupy seats', () => {
    // ADR-0022: box office is "the shows.inPersonSold counter (with
    // legacyReserved folded in)". Both take a real seat — remainingSeats
    // subtracts each — so both belong in a seats-issued / capacity-fill view,
    // even though the secretary dashboard's "sold" figure omits legacyReserved
    // as a reservation rather than a sale.
    const result = buildMemberSeason({
      today,
      shows: [
        show({ id: '1', date: '2026-07-01', activeTicketCount: 70, inPersonSold: 30, legacyReserved: 40 }),
      ],
      ticketRows: [row({ showId: '1', adult: 50, child: 20, online: 60, partner: 10 })],
    })

    expect(result.issued).toBe(140)
    expect(result.channels).toEqual({ online: 60, partner: 10, comp: 0, boxOffice: 70 })
    // Box office has no ticket type, so it is reported apart from adult/child.
    expect(result.types).toEqual({ adult: 50, child: 20, boxOffice: 70 })
    expect(result.shows[0]).toMatchObject({ issued: 140, capacity: 320, percent: 44 })
  })

  it('counts comps in the headline and keeps them visible as their own channel', () => {
    const result = buildMemberSeason({
      today,
      shows: [show({ id: '1', date: '2026-07-01', activeTicketCount: 100 })],
      ticketRows: [row({ showId: '1', adult: 100, online: 90, comp: 10 })],
    })

    expect(result.issued).toBe(100)
    expect(result.channels.comp).toBe(10)
    expect(result.channels.online).toBe(90)
  })

  it('rolls up season capacity and fill across performances', () => {
    const result = buildMemberSeason({
      today,
      shows: [
        show({ id: '1', date: '2026-07-01', activeTicketCount: 160 }),
        show({ id: '2', date: '2026-07-02', activeTicketCount: 125, venue: 'zimsko-kino' }),
      ],
      ticketRows: [],
    })

    expect(result.issued).toBe(285)
    expect(result.capacity).toBe(570)
    expect(result.fillPercent).toBe(50)
    expect(result.shows[0]).toMatchObject({ showId: '1', issued: 160, capacity: 320, percent: 50 })
    expect(result.shows[1]).toMatchObject({ showId: '2', issued: 125, capacity: 250, percent: 50 })
  })

  it('lists performances chronologically', () => {
    const result = buildMemberSeason({
      today,
      shows: [
        show({ id: 'b', date: '2026-08-01' }),
        show({ id: 'a', date: '2026-06-01' }),
        show({ id: 'c', date: '2026-09-01' }),
      ],
      ticketRows: [],
    })

    expect(result.shows.map((s) => s.showId)).toEqual(['a', 'b', 'c'])
  })

  it('ignores ticket rows for shows outside the season set', () => {
    // A stray row (deleted show, or a show in another year) must not leak into
    // the season channel/type mix.
    const result = buildMemberSeason({
      today,
      shows: [show({ id: '1', date: '2026-07-01', activeTicketCount: 10 })],
      ticketRows: [row({ showId: '1', adult: 10, online: 10 }), row({ showId: '999', adult: 5, online: 5 })],
    })

    expect(result.channels.online).toBe(10)
    expect(result.types.adult).toBe(10)
  })

  it('returns a zeroed season when nothing is scheduled this year', () => {
    const result = buildMemberSeason({ today, shows: [], ticketRows: [] })

    expect(result).toMatchObject({
      year: 2026,
      issued: 0,
      capacity: 0,
      fillPercent: 0,
      shows: [],
      types: { adult: 0, child: 0, boxOffice: 0 },
      channels: { online: 0, partner: 0, comp: 0, boxOffice: 0 },
    })
  })
})
