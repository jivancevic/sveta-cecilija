import { describe, expect, it } from 'vitest'
import {
  channelSplit,
  emptySales,
  performanceNumbers,
  salesBadges,
  salesRowView,
  seatsSold,
  seatsRemaining,
  type PerformanceSales,
} from './sales-view'

// The blagajna's numbers on one evening (#502), as pure functions.
//
// The expected values here are worked by hand from ADR-0025's seat model
// (capacity − active tickets − door − legacy) and from the €20/€10 constants,
// never by re-running the code's own arithmetic.

function sales(over: Partial<PerformanceSales> = {}): PerformanceSales {
  return {
    ...emptySales('1', 'ljetno-kino'),
    online: 80,
    partner: 12,
    comp: 4,
    door: 30,
    legacy: 6,
    scanned: 101,
    ticketRevenueCents: 176_000,
    offlineRevenueCents: 66_000,
    ...over,
  }
}

describe('seat arithmetic', () => {
  it('counts every source of a seat, ticketed or not', () => {
    // 80 + 12 + 4 + 30 + 6, worked by hand.
    expect(seatsSold(sales())).toBe(132)
  })

  it('takes the capacity from the venue, never from a stored column', () => {
    // Ljetno holds 350 (ADR-0025): 350 − 132.
    expect(seatsRemaining(sales())).toBe(218)
    // Zimsko holds 250.
    expect(seatsRemaining(sales({ venue: 'zimsko-kino' }))).toBe(118)
  })

  it('reports an oversold room rather than clamping it at zero', () => {
    // A door batch typed as 400 is a real mistake somebody has to see.
    expect(seatsRemaining(sales({ door: 400 }))).toBe(-152)
  })
})

describe('the channel split', () => {
  it('names the five sources of a seat, biggest first is NOT the order', () => {
    expect(channelSplit(sales()).map((c) => c.label)).toEqual([
      'online',
      'partner',
      'gratis',
      'vrata',
      'staro',
    ])
  })

  it('leaves out a channel that sold nothing, so a row stays short', () => {
    const split = channelSplit(sales({ partner: 0, legacy: 0 }))
    expect(split.map((c) => c.label)).toEqual(['online', 'gratis', 'vrata'])
    expect(split.map((c) => c.value)).toEqual([80, 4, 30])
  })

  it('is empty when nothing has been sold at all', () => {
    expect(channelSplit(emptySales('1', 'ljetno-kino'))).toEqual([])
  })
})

describe('the badges', () => {
  it('shows nothing on an ordinary evening', () => {
    expect(salesBadges(sales())).toEqual([])
  })

  it('names a paused sale, a cancellation, a venue move and a moved date', () => {
    const badges = salesBadges(
      sales({ paused: true, cancelled: true, moved: true, rescheduled: true }),
    )
    expect(badges.map((b) => b.key)).toEqual(['cancelled', 'paused', 'moved', 'rescheduled'])
    expect(badges[0]!.label).toBe('Otkazano')
  })
})

describe('the detail numbers', () => {
  it('never prints money to a viewer without `finance`', () => {
    const labels = performanceNumbers(sales(), false).map((n) => n.label)
    expect(labels).not.toContain('Prihod')
    expect(labels).toEqual([
      'Prodano',
      'Slobodno',
      'Ušlo',
      'Online',
      'Partner',
      'Gratis',
      'Na vratima',
      'Prethodna stranica',
    ])
  })

  it('adds the money for a `finance` holder, ledger included', () => {
    const money = performanceNumbers(sales(), true).find((n) => n.label === 'Prihod')
    // 176.000 c of orders + 66.000 c of the offline ledger = 2420,00 €, in the
    // same spelling Narudžbe uses (`formatEur`).
    expect(money?.value).toBe('2420,00 €')
  })
})

describe('one row of the list', () => {
  it('reads the room in one line', () => {
    const row = salesRowView(sales())
    expect(row.soldOf).toBe('132/350')
    expect(row.remaining).toBe('još 218')
  })

  it('says so when the room is over capacity instead of promising seats', () => {
    expect(salesRowView(sales({ door: 400 })).remaining).toBe('152 preko kapaciteta')
  })

  it('says there is no sale yet rather than printing five zeroes', () => {
    const row = salesRowView(emptySales('1', 'zimsko-kino'))
    expect(row.soldOf).toBe('0/250')
    expect(row.split).toBe('Još nema prodaje.')
  })
})
