import { describe, expect, it } from 'vitest'
import {
  izvedbaHead,
  izvedbaRow,
  izvedbaTitle,
  izvedbeHero,
  izvedbeMonths,
  rowChip,
  rowSales,
} from './izvedbe-screen'
import { emptySales, type PerformanceSales } from './sales-view'
import { groupByMonth, type RosterPerformance } from './roster-loaders'

// #567 — what Izvedbe says. Two rules are asserted about the VALUES the page
// renders rather than about markup: this screen names the client of a booking
// (the mirror of Moreška, which refuses to, Q30), and a row with no sales
// carries no sales line at all rather than a row of zeroes.

const performance = (over: Partial<RosterPerformance> = {}): RosterPerformance => ({
  id: '10',
  date: '2026-09-14',
  time: '21:00',
  kind: 'redovna',
  isPublic: true,
  venue: 'ljetno-kino',
  location: null,
  client: null,
  cancelled: false,
  voditeljNote: null,
  startMs: Date.parse('2026-09-14T19:00:00.000Z'),
  thresholdCrni: 8,
  thresholdBili: 8,
  myAnswer: null,
  myArmy: null,
  myTitle: null,
  lineupConfirmed: false,
  canAnswer: true,
  chip: null,
  ...over,
})

const booking = (over: Partial<RosterPerformance> = {}) =>
  performance({
    id: '11',
    kind: 'dmc',
    isPublic: false,
    venue: null,
    location: 'Luka',
    client: 'Le Ponant',
    time: '10:00',
    ...over,
  })

const sales = (over: Partial<PerformanceSales> = {}): PerformanceSales => ({
  ...emptySales('10', 'ljetno-kino'),
  online: 80,
  partner: 12,
  door: 30,
  ...over,
})

describe('izvedbaTitle', () => {
  it('names a public evening by its kind', () => {
    expect(izvedbaTitle(performance())).toBe('Redovna')
  })

  // The mirror of Moreška's Q30 rule: the dancer's screen never names a client,
  // this one has to. "Brod" alone is three evenings in one season.
  it('names a booking by its kind AND its client', () => {
    expect(izvedbaTitle(booking())).toBe('Adriatic DMC, Le Ponant')
  })

  it('falls back to the kind alone when nobody booked it', () => {
    expect(izvedbaTitle(booking({ client: null }))).toBe('Adriatic DMC')
  })
})

describe('izvedbaRow', () => {
  it('prints the hour, the house and the sale of a public evening', () => {
    const row = izvedbaRow(performance(), sales())

    expect(row).toMatchObject({
      href: '/app/performances/10',
      day: '14',
      gold: true,
      title: 'Redovna',
      meta: '21:00 · Ljetno kino',
    })
    expect(row.sales).toEqual({
      sold: 'prodano 122 od 350',
      split: 'online 80 · partner 12 · vrata 30',
    })
  })

  it('carries no sales line at all without seats: a booking sells none', () => {
    const row = izvedbaRow(booking(), null)

    expect(row.sales).toBeNull()
    expect(row.gold).toBe(false)
    expect(row.meta).toBe('10:00 · Luka')
    expect(row.title).toBe('Adriatic DMC, Le Ponant')
  })

  it('says so when a public evening has sold nothing yet', () => {
    expect(rowSales(emptySales('10', 'zimsko-kino'))).toEqual({
      sold: 'prodano 0 od 250',
      split: 'Još nema prodaje.',
    })
  })
})

describe('rowChip', () => {
  it('lets the worst news win the one chip a row has', () => {
    expect(rowChip(performance(), sales({ cancelled: true, paused: true }))).toEqual({
      label: 'Otkazano',
      tone: 'warn',
    })
    expect(rowChip(performance(), sales({ paused: true }))).toEqual({
      label: 'Prodaja pauzirana',
      tone: 'warn',
    })
    expect(rowChip(performance(), sales({ moved: true }))).toEqual({
      label: 'Preseljeno',
      tone: 'plain',
    })
  })

  it('reads a cancelled BOOKING off the row, which has no sales to read', () => {
    expect(rowChip(booking({ cancelled: true }), null)).toEqual({
      label: 'Otkazano',
      tone: 'warn',
    })
    expect(rowChip(booking(), null)).toBeNull()
  })
})

describe('izvedbeMonths', () => {
  it('counts the evenings that are still going to happen, in the selling register', () => {
    const months = izvedbeMonths(
      groupByMonth([performance(), performance({ id: '12', cancelled: true }), booking()]),
      new Map([['10', sales()]]),
    )

    expect(months).toHaveLength(1)
    expect(months[0]!.aside).toBe('2 izvedbe')
    expect(months[0]!.rows).toHaveLength(3)
    // Only the row the map knows about carries numbers.
    expect(months[0]!.rows[0]!.sales).not.toBeNull()
    expect(months[0]!.rows[2]!.sales).toBeNull()
  })

  it('hands every row a null sale when the reader is not the blagajna', () => {
    const months = izvedbeMonths(groupByMonth([performance()]), null)
    expect(months[0]!.rows[0]!.sales).toBeNull()
  })
})

describe('izvedbeHero', () => {
  it('carries the ring’s two numbers and what is left of the house', () => {
    const hero = izvedbeHero(performance(), sales())

    expect(hero).toMatchObject({
      eyebrow: 'Sljedeća izvedba · Ljetno kino',
      day: '14',
      month: 'rujna',
      meta: 'Ponedjeljak · 21:00 · Redovna',
      href: '/app/performances/10',
    })
    expect(hero.seats).toEqual({ sold: 122, capacity: 350, caption: 'još 228' })
  })

  it('says an oversold room out loud rather than showing a comfortable zero', () => {
    const hero = izvedbeHero(performance(), sales({ door: 300 }))
    expect(hero.seats?.caption).toBe('42 preko kapaciteta')
  })

  it('has no seats for a reader who is not the blagajna', () => {
    expect(izvedbeHero(performance(), null).seats).toBeNull()
  })
})

describe('izvedbaHead', () => {
  // Q32: the title of one evening is the DATE. "Redovna" named the category on
  // twenty-two rows of a season and never the evening in front of the reader.
  it('titles the detail with the date and puts the kind under it', () => {
    expect(izvedbaHead(performance(), sales())).toMatchObject({
      title: 'Ponedjeljak, 14. rujna',
      meta: 'Redovna · 21:00 · Ljetno kino',
      chips: [],
    })
  })

  it('names the client of a booking in the line under the date', () => {
    expect(izvedbaHead(booking(), null).meta).toBe('Adriatic DMC, Le Ponant · 10:00 · Luka')
  })

  it('carries every state of a public evening as a chip', () => {
    const head = izvedbaHead(performance(), sales({ paused: true, rescheduled: true }))
    expect(head.chips).toEqual([
      { label: 'Prodaja pauzirana', tone: 'warn' },
      { label: 'Datum pomaknut', tone: 'plain' },
    ])
  })
})
