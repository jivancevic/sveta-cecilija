import { describe, expect, it } from 'vitest'
import { APP_STRINGS } from './strings'
import {
  channelSplit,
  emptySales,
  ledgerErrorMessage,
  mayOpenPerformance,
  onlineRevenueByShow,
  partnerReceivableNote,
  performanceNumbers,
  salesBadges,
  salesRowView,
  seatsSold,
  seatsRemaining,
  showsRosterHalf,
  ticketedSeats,
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
    partnerAdult: 10,
    partnerChild: 2,
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

describe('the money of one evening', () => {
  // #538 — the four cases that decide what an evening actually took.
  const rows = [
    { showId: '1', channel: 'online' as const, totalCents: 4000, refundStatus: 'none' as const },
    // Refunded: the money went back, so it is not this evening's take.
    { showId: '1', channel: 'online' as const, totalCents: 2000, refundStatus: 'refunded' as const },
    // The reseller holds these euros until the obračun (ADR-0008).
    { showId: '1', channel: 'partner' as const, totalCents: 6000, refundStatus: 'none' as const },
    // A storno: the tickets are void, `total` and `refund_status` are not.
    { showId: '1', channel: 'partner' as const, totalCents: 4000, refundStatus: 'none' as const },
    // Goodwill, €0 (ADR-0019).
    { showId: '1', channel: 'comp' as const, totalCents: 0, refundStatus: 'none' as const },
    { showId: '2', channel: 'online' as const, totalCents: 1500, refundStatus: 'none' as const },
  ]

  it('counts online money only, evening by evening', () => {
    const byShow = onlineRevenueByShow(rows)
    expect(byShow.get('1')).toBe(4000)
    expect(byShow.get('2')).toBe(1500)
  })

  it('leaves an evening with nothing but partner sales at zero, not at face value', () => {
    const byShow = onlineRevenueByShow(rows.filter((r) => r.channel === 'partner'))
    expect(byShow.get('1')).toBe(0)
  })
})

// #538 — partner seats leave Prihod, but they do not leave the screen.
describe('the partner receivable line', () => {
  it('prices the partner seats of an evening at face value, as a receivable', () => {
    // 10 adults at €20 and 2 children at €10, worked by hand: 220,00 €.
    const note = partnerReceivableNote(sales({ partnerAdult: 10, partnerChild: 2 }), true)
    expect(note).toBe('Partneri: 12 ulaznica, nominalno 220,00 € (potraživanje)')
  })

  it('says "ulaznica" for one seat, the Croatian singular', () => {
    const note = partnerReceivableNote(sales({ partnerAdult: 1, partnerChild: 0 }), true)
    expect(note).toBe('Partneri: 1 ulaznica, nominalno 20,00 € (potraživanje)')
  })

  it('says "ulaznice" for the few bucket', () => {
    const note = partnerReceivableNote(sales({ partnerAdult: 3, partnerChild: 0 }), true)
    expect(note).toBe('Partneri: 3 ulaznice, nominalno 60,00 € (potraživanje)')
  })

  it('is omitted when the evening sold no partner seats', () => {
    expect(partnerReceivableNote(sales({ partnerAdult: 0, partnerChild: 0 }), true)).toBeNull()
  })

  it('is money, so a viewer without `finance` never gets it', () => {
    expect(partnerReceivableNote(sales({ partnerAdult: 10, partnerChild: 2 }), false)).toBeNull()
  })
})

describe('which halves of the screen a viewer gets', () => {
  it('gives the roster half to a voditelj who does not dance', () => {
    expect(showsRosterHalf(true, false)).toBe(true)
  })

  it('gives it to a dancer', () => {
    expect(showsRosterHalf(false, true)).toBe(true)
  })

  it('gives it to a secretary who also dances: both halves, same rows', () => {
    expect(showsRosterHalf(false, true)).toBe(true)
  })

  it('withholds it from a blagajna account that neither leads nor dances', () => {
    // Which is also what keeps a ship call, with no numbers on it, off a sales
    // list (ADR-0024).
    expect(showsRosterHalf(false, false)).toBe(false)
  })
})

describe('the seats that carry a buyer', () => {
  it('counts the three ticketed channels and neither ledger source', () => {
    // 80 + 12 + 4, worked by hand: the 30 at the door and the 6 from the old
    // site produced no order, so there is nobody to write to about them.
    expect(ticketedSeats(sales())).toBe(96)
    expect(ticketedSeats(sales({ door: 300, legacy: 40 }))).toBe(96)
  })

  it('is zero on an evening that has only sold at the door', () => {
    // Which is what lets Uredi still move that evening's house: there is no
    // buyer the move would have to be announced to.
    expect(ticketedSeats(sales({ online: 0, partner: 0, comp: 0, door: 58 }))).toBe(0)
  })
})

describe('which evenings a viewer may open', () => {
  it('opens a public evening for anybody the screen admits', () => {
    expect(mayOpenPerformance({ roster: false, isPublic: true })).toBe(true)
    expect(mayOpenPerformance({ roster: true, isPublic: true })).toBe(true)
  })

  it('opens a booking for the roster', () => {
    expect(mayOpenPerformance({ roster: true, isPublic: false })).toBe(true)
  })

  it('hides a booking from a blagajna-only account, which is not shown one', () => {
    // The detail page prints the client and the voditelj's note. An account
    // whose list deliberately leaves bookings out must not reach one by typing
    // an id.
    expect(mayOpenPerformance({ roster: false, isPublic: false })).toBe(false)
  })
})

describe('why the ledger refused', () => {
  // The vocabulary is the route's, not this module's: every code the writer can
  // throw has to have a sentence, or a cashier meets "pokušaj ponovno" for
  // something they could have fixed in one tap.
  const CODES = [
    'EMPTY',
    'BAD_TYPE',
    'BAD_QUANTITY',
    'BAD_PRICE',
    'PRICE_ABOVE_FACE',
    'DISCOUNT_REASON_REQUIRED',
    'LABEL_TOO_LONG',
    'OVER_CORRECTION',
  ] as const

  it('has a Croatian sentence for every code the ledger throws', () => {
    for (const code of CODES) {
      const message = ledgerErrorMessage(code)
      expect(message, code).not.toBe(APP_STRINGS.showActions.failed)
      expect(message.length, code).toBeGreaterThan(20)
    }
  })

  it('names what to change rather than restating the rule', () => {
    expect(ledgerErrorMessage('PRICE_ABOVE_FACE')).toContain('20 €')
    expect(ledgerErrorMessage('DISCOUNT_REASON_REQUIRED')).toContain('umirovljenici')
  })

  it('falls back to the generic sentence for a code it has never seen', () => {
    // A new code must render a sentence, never `undefined`.
    expect(ledgerErrorMessage('SOMETHING_NEW')).toBe(APP_STRINGS.showActions.failed)
    expect(ledgerErrorMessage(undefined)).toBe(APP_STRINGS.showActions.failed)
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
