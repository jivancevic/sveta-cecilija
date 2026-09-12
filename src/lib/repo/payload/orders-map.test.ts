import { describe, expect, it } from 'vitest'
import { isNotFound, toOrderRow, toTicketRow } from './orders-map'

// The drift point of Narudžbe (#501).
//
// Everything above the seam trusts these two functions to have read the right
// column: the money, the channel, the refund state and a ticket's two
// lifecycles all arrive here as loosely-typed Payload fields and leave as a
// domain row. A rename, an enum value or a `dayOnly` Date that comes back as a
// Date object would show up on a phone as a wrong number rather than as an
// error, so the mapping is asserted here rather than inferred from a screen.

/** The shape `payload.find({ depth: 1 })` hands back for an online order. */
const DOC = {
  id: 42,
  code: 'AB3K',
  channel: 'online',
  buyerName: 'Ivan Horvat',
  email: 'ivan@example.com',
  adultCount: 2,
  childCount: 1,
  total: 5000,
  refundStatus: 'none',
  stripePaymentIntentId: 'pi_123',
  createdAt: '2026-08-14T18:30:00.000Z',
  show: { id: 6, date: '2026-08-14', time: '21:00', venue: 'ljetno-kino' },
  partner: null,
  member: null,
  promoCode: null,
}

describe('toOrderRow', () => {
  it('reads an online order off the document', () => {
    expect(toOrderRow(DOC)).toEqual({
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
    })
  })

  // `total` is EUR cents on the order row and is the ONLY source of the amount:
  // a SUM across the join to tickets multiplies it by the party size.
  it('keeps the total in cents, whatever type the driver hands over', () => {
    expect(toOrderRow({ ...DOC, total: 5000 }).totalCents).toBe(5000)
    // node-postgres returns a numeric column as a string.
    expect(toOrderRow({ ...DOC, total: '5000' }).totalCents).toBe(5000)
    expect(toOrderRow({ ...DOC, total: 0 }).totalCents).toBe(0)
    // Never NaN: a missing column reads as zero, not as "0,00 €" that is really
    // "NaN €" on the screen.
    expect(toOrderRow({ ...DOC, total: undefined }).totalCents).toBe(0)
    expect(toOrderRow({ ...DOC, total: null }).totalCents).toBe(0)
  })

  it('reads the refund state off refundStatus and nothing else', () => {
    expect(toOrderRow({ ...DOC, refundStatus: 'refunded' }).refunded).toBe(true)
    expect(toOrderRow({ ...DOC, refundStatus: 'none' }).refunded).toBe(false)
    // The enum has exactly two values (ADR-0021); anything else is not a refund.
    expect(toOrderRow({ ...DOC, refundStatus: undefined }).refunded).toBe(false)
    expect(toOrderRow({ ...DOC, refundStatus: 'pending' }).refunded).toBe(false)
  })

  it('takes the three channels and treats an unknown one as online', () => {
    expect(toOrderRow({ ...DOC, channel: 'partner' }).channel).toBe('partner')
    expect(toOrderRow({ ...DOC, channel: 'comp' }).channel).toBe('comp')
    expect(toOrderRow({ ...DOC, channel: 'online' }).channel).toBe('online')
    expect(toOrderRow({ ...DOC, channel: undefined }).channel).toBe('online')
  })

  it('picks the attribution names out of the populated relationships', () => {
    const row = toOrderRow({
      ...DOC,
      channel: 'partner',
      partner: { id: 3, name: 'Kaleta' },
      member: { id: 9, name: 'Marija Fabris' },
      promoCode: { id: 4, code: 'CICI15' },
    })
    expect(row.partnerName).toBe('Kaleta')
    expect(row.memberName).toBe('Marija Fabris')
    expect(row.promoCode).toBe('CICI15')
  })

  // At `depth: 0` a relationship is the bare id, not the document. Reading a
  // name off a number must be "no name", never "3".
  it('is silent about a relationship that came back as an id', () => {
    const row = toOrderRow({ ...DOC, partner: 3, member: 9, promoCode: 4, show: 6 })
    expect(row.partnerName).toBeNull()
    expect(row.memberName).toBeNull()
    expect(row.promoCode).toBeNull()
    expect(row.show).toBeNull()
  })

  // A `dayOnly` column comes back as a Date from the adapter, whose `String()`
  // is "Fri Aug 14 2026 …" — slicing that would print "Fri Aug 1".
  it('reads a date the adapter handed over as a Date', () => {
    const row = toOrderRow({
      ...DOC,
      show: { id: 6, date: new Date('2026-08-14T00:00:00.000Z'), time: '21:00', venue: 'ljetno-kino' },
    })
    expect(row.show?.date).toBe('2026-08-14')
  })

  it('reads hasPayment as "is there a Stripe payment to refund"', () => {
    expect(toOrderRow({ ...DOC, stripePaymentIntentId: 'pi_1' }).hasPayment).toBe(true)
    expect(toOrderRow({ ...DOC, stripePaymentIntentId: null }).hasPayment).toBe(false)
    expect(toOrderRow({ ...DOC, stripePaymentIntentId: '  ' }).hasPayment).toBe(false)
  })

  it('reads a blank buyer name or address as absent, not as an empty string', () => {
    const row = toOrderRow({ ...DOC, buyerName: '   ', email: '', code: '' })
    expect(row.buyerName).toBeNull()
    expect(row.email).toBeNull()
    expect(row.code).toBeNull()
  })
})

describe('toTicketRow', () => {
  const TICKET = {
    id: 7,
    type: 'adult',
    status: 'active',
    cancelledAt: null,
    cancelReason: null,
    scanned: false,
    scannedAt: null,
  }

  it('reads an active, unscanned adult ticket', () => {
    expect(toTicketRow(TICKET)).toEqual({
      id: '7',
      type: 'adult',
      cancelled: false,
      cancelReason: null,
      scanned: false,
      scannedAt: null,
    })
  })

  it('reads the lifecycle off status, and the reason off cancelReason', () => {
    expect(toTicketRow({ ...TICKET, status: 'cancelled', cancelReason: 'refund' })).toMatchObject({
      cancelled: true,
      cancelReason: 'refund',
    })
    expect(toTicketRow({ ...TICKET, status: 'cancelled', cancelReason: 'storno' })).toMatchObject({
      cancelled: true,
      cancelReason: 'storno',
    })
  })

  // The two are independent columns: a row voided by an older path can carry no
  // reason, and a reason on an active row is not a cancellation.
  it('keeps "is it void" and "why" apart', () => {
    expect(toTicketRow({ ...TICKET, status: 'cancelled', cancelReason: null }).cancelReason).toBeNull()
    expect(toTicketRow({ ...TICKET, status: 'active', cancelReason: 'refund' }).cancelled).toBe(false)
    // Only the DB's two values; anything else is not a reason this screen names.
    expect(
      toTicketRow({ ...TICKET, status: 'cancelled', cancelReason: 'other' }).cancelReason,
    ).toBeNull()
  })

  it('reads the type as the enum, defaulting to adult', () => {
    expect(toTicketRow({ ...TICKET, type: 'child' }).type).toBe('child')
    expect(toTicketRow({ ...TICKET, type: undefined }).type).toBe('adult')
  })

  it('reads the scan and its timestamp, Date or string', () => {
    expect(
      toTicketRow({ ...TICKET, scanned: true, scannedAt: '2026-08-14T19:05:00.000Z' }).scannedAt,
    ).toBe('2026-08-14T19:05:00.000Z')
    expect(
      toTicketRow({ ...TICKET, scanned: true, scannedAt: new Date('2026-08-14T19:05:00.000Z') })
        .scannedAt,
    ).toBe('2026-08-14T19:05:00.000Z')
    // `scanned` is a checkbox: only a real true is a scan.
    expect(toTicketRow({ ...TICKET, scanned: 'yes' }).scanned).toBe(false)
    expect(toTicketRow({ ...TICKET, scanned: true }).scanned).toBe(true)
  })
})

describe('isNotFound', () => {
  // The whole point: a missing row is null, an outage is a 500. A bare catch
  // would tell the blagajna a real order does not exist while the database is
  // simply down.
  it('recognises Payload’s not-found', () => {
    expect(isNotFound({ status: 404 })).toBe(true)
    expect(isNotFound({ name: 'NotFound' })).toBe(true)
    expect(isNotFound(new Error('The requested resource was not found.'))).toBe(true)
  })

  it('does not swallow anything else', () => {
    expect(isNotFound(new Error('Connection terminated unexpectedly'))).toBe(false)
    expect(isNotFound({ status: 500 })).toBe(false)
    expect(isNotFound(null)).toBe(false)
    expect(isNotFound(undefined)).toBe(false)
  })
})
