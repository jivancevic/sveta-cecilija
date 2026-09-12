import { describe, expect, it } from 'vitest'
import {
  channelLabel,
  formatEur,
  orderRowView,
  pageCount,
  partyLabel,
  performanceLabel,
  refundOffer,
  ticketView,
  zagrebStamp,
} from './orders-view'
import type { OrderRow, OrderTicketRow } from '@/lib/repo/orders'

// How Narudžbe reads an order out loud (#501). Pure, so the wording of a row is
// asserted here rather than inferred from a screenshot.

const ONLINE: OrderRow = {
  id: '42',
  code: 'AB3K',
  buyerName: 'Ivan Horvat',
  email: 'ivan@example.com',
  adultCount: 2,
  childCount: 1,
  totalCents: 5000,
  channel: 'online',
  refunded: false,
  partnerName: null,
  memberName: null,
  promoCode: null,
  hasPayment: true,
  createdAt: '2026-08-14T18:30:00.000Z',
  show: { id: '6', date: '2026-08-14', time: '21:00', venue: 'ljetno-kino' },
}

describe('formatEur', () => {
  it('is the Croatian spelling of an amount in cents', () => {
    expect(formatEur(5000)).toBe('50,00 €')
    expect(formatEur(4050)).toBe('40,50 €')
    expect(formatEur(5)).toBe('0,05 €')
    expect(formatEur(0)).toBe('0,00 €')
  })
})

describe('partyLabel', () => {
  it('names both halves of a mixed party', () => {
    expect(partyLabel(2, 1)).toBe('2 odraslih, 1 dječja')
  })

  it('drops the half that is zero', () => {
    expect(partyLabel(3, 0)).toBe('3 odraslih')
    expect(partyLabel(0, 2)).toBe('2 dječjih')
  })

  it('uses the singular where Croatian wants it', () => {
    expect(partyLabel(1, 0)).toBe('1 odrasla')
    expect(partyLabel(0, 1)).toBe('1 dječja')
  })
})

describe('channelLabel', () => {
  it('is the bare channel for a plain online order', () => {
    expect(channelLabel(ONLINE)).toBe('Online')
  })

  it('names the reseller behind a partner sale', () => {
    expect(channelLabel({ ...ONLINE, channel: 'partner', partnerName: 'Kaleta' })).toBe(
      'Partner · Kaleta',
    )
  })

  it('names the member a comp was written for', () => {
    expect(channelLabel({ ...ONLINE, channel: 'comp', memberName: 'Marija Fabris' })).toBe(
      'Gratis · Marija Fabris',
    )
  })

  it('marks an online order that carried a promo code, which stays online', () => {
    expect(channelLabel({ ...ONLINE, promoCode: 'CICI15' })).toBe('Online · Promo')
  })

  it('falls back to the bare channel when the attribution row is gone', () => {
    expect(channelLabel({ ...ONLINE, channel: 'partner', partnerName: null })).toBe('Partner')
    expect(channelLabel({ ...ONLINE, channel: 'comp', memberName: null })).toBe('Gratis')
  })
})

describe('performanceLabel', () => {
  it('is the date and the venue people say, not the slug', () => {
    expect(performanceLabel(ONLINE.show)).toBe('pet, 14. kolovoza · Ljetno kino')
    expect(
      performanceLabel({ id: '7', date: '2026-11-05', time: '19:30', venue: 'zimsko-kino' }),
    ).toBe('čet, 5. studenoga · Centar za kulturu')
  })

  it('says so when the performance is gone rather than printing nothing', () => {
    expect(performanceLabel(null)).toBe('Izvedba je obrisana')
  })

  it('prints an unknown venue slug rather than dropping it', () => {
    expect(performanceLabel({ id: '8', date: '2026-08-14', time: '21:00', venue: 'luka' })).toContain(
      'luka',
    )
  })
})

describe('refundOffer', () => {
  it('offers the button to a refunds holder on a paid, unrefunded order', () => {
    expect(refundOffer(ONLINE, true)).toBe('available')
  })

  // A `tickets`-only holder runs the blagajna; moving money back is a separate
  // permission and the button must not even be on the screen (ADR-0023).
  it('hides it from a holder without refunds', () => {
    expect(refundOffer(ONLINE, false)).toBe('hidden')
  })

  it('reports an order whose money already went back', () => {
    expect(refundOffer({ ...ONLINE, refunded: true }, true)).toBe('already')
  })

  it('reports an order there is nothing to refund on', () => {
    const comp: OrderRow = { ...ONLINE, channel: 'comp', totalCents: 0, hasPayment: false }
    expect(refundOffer(comp, true)).toBe('not-payable')
  })
})

describe('ticketView', () => {
  const ticket: OrderTicketRow = {
    id: '1',
    type: 'adult',
    cancelled: false,
    cancelReason: null,
    scanned: false,
    scannedAt: null,
  }

  it('reads an active, unscanned adult ticket', () => {
    expect(ticketView(ticket)).toEqual({
      type: 'Odrasla',
      state: 'Važeća',
      cancelled: false,
      scan: 'Nije propuštena',
    })
  })

  it('names the reason a ticket was voided', () => {
    expect(ticketView({ ...ticket, cancelled: true, cancelReason: 'refund' }).state).toBe(
      'Poništena · povrat',
    )
    expect(ticketView({ ...ticket, cancelled: true, cancelReason: 'storno' }).state).toBe(
      'Poništena · storno',
    )
    expect(ticketView({ ...ticket, cancelled: true, cancelReason: null }).state).toBe('Poništena')
  })

  it('says when a ticket went through the door, in Zagreb time', () => {
    const view = ticketView({
      ...ticket,
      type: 'child',
      scanned: true,
      scannedAt: '2026-08-14T19:05:00.000Z',
    })
    expect(view.type).toBe('Dječja')
    // 19:05 UTC in August is 21:05 in Korčula.
    expect(view.scan).toBe('Propuštena 14. kolovoza u 21:05')
  })

  it('still reports a scan whose timestamp is missing or broken', () => {
    expect(ticketView({ ...ticket, scanned: true, scannedAt: null }).scan).toBe('Propuštena')
    expect(ticketView({ ...ticket, scanned: true, scannedAt: 'not a date' }).scan).toBe('Propuštena')
  })
})

describe('zagrebStamp', () => {
  it('reads an instant on the Korčula wall clock', () => {
    // 22:30 UTC on 13 August is already 00:30 on 14 August in Zagreb.
    expect(zagrebStamp('2026-08-13T22:30:00.000Z')).toBe('14. kolovoza u 00:30')
  })

  it('follows the winter offset too', () => {
    expect(zagrebStamp('2026-11-05T18:30:00.000Z')).toBe('5. studenoga u 19:30')
  })

  it('is empty for a timestamp it cannot read', () => {
    expect(zagrebStamp(null)).toBe('')
    expect(zagrebStamp('later')).toBe('')
  })
})

describe('pageCount', () => {
  it('is one page even when nothing matched, so the pager never says "0 of 0"', () => {
    expect(pageCount(0, 25)).toBe(1)
  })

  it('rounds a partial page up', () => {
    expect(pageCount(25, 25)).toBe(1)
    expect(pageCount(26, 25)).toBe(2)
    expect(pageCount(51, 25)).toBe(3)
  })
})

describe('orderRowView', () => {
  it('gathers everything one row of the list prints', () => {
    expect(orderRowView(ONLINE)).toEqual({
      href: '/app/orders/42',
      buyer: 'Ivan Horvat',
      code: 'AB3K',
      performance: 'pet, 14. kolovoza · Ljetno kino',
      party: '2 odraslih, 1 dječja',
      total: '50,00 €',
      channel: 'Online',
      refunded: false,
    })
  })

  it('names a nameless partner sale rather than leaving the row blank', () => {
    expect(orderRowView({ ...ONLINE, buyerName: null }).buyer).toBe('Bez imena')
    expect(orderRowView({ ...ONLINE, buyerName: '   ' }).buyer).toBe('Bez imena')
  })

  it('flags a refunded order', () => {
    expect(orderRowView({ ...ONLINE, refunded: true }).refunded).toBe(true)
  })
})
