import { describe, it, expect } from 'vitest'
import {
  addOfflineTotals,
  faceValueCents,
  netQuantity,
  OfflineSaleValidationError,
  resolveOfflineSaleLines,
  sumOfflineLines,
  MAX_DISCOUNT_LABEL_LENGTH,
} from './lines'

describe('faceValueCents', () => {
  it('mirrors the fixed prices', () => {
    expect(faceValueCents('adult')).toBe(2000)
    expect(faceValueCents('child')).toBe(1000)
  })
})

describe('resolveOfflineSaleLines', () => {
  it('defaults a line with no price to face value', () => {
    const [adult, child] = resolveOfflineSaleLines([
      { ticketType: 'adult', quantity: 48 },
      { ticketType: 'child', quantity: 6 },
    ])
    expect(adult).toEqual({ ticketType: 'adult', quantity: 48, unitPriceCents: 2000, discountLabel: null })
    expect(child).toEqual({ ticketType: 'child', quantity: 6, unitPriceCents: 1000, discountLabel: null })
  })

  it('keeps a discounted seat an ADULT seat and records the reason beside it', () => {
    // The 2026 pensioner group: 32 people who paid €15. Not a third price
    // category — an adult line carrying a label (ADR-0025).
    const [line] = resolveOfflineSaleLines([
      {
        ticketType: 'adult',
        quantity: 32,
        unitPriceCents: 1500,
        discountLabel: 'umirovljenici (grupni popust)',
      },
    ])
    expect(line.ticketType).toBe('adult')
    expect(line.unitPriceCents).toBe(1500)
    expect(line.discountLabel).toBe('umirovljenici (grupni popust)')
  })

  it('refuses a below-face price with no reason', () => {
    expect(() => resolveOfflineSaleLines([{ ticketType: 'adult', quantity: 5, unitPriceCents: 1500 }])).toThrow(
      OfflineSaleValidationError,
    )
    try {
      resolveOfflineSaleLines([{ ticketType: 'adult', quantity: 5, unitPriceCents: 1500 }])
    } catch (err) {
      expect((err as OfflineSaleValidationError).code).toBe('DISCOUNT_REASON_REQUIRED')
    }
  })

  it('treats a whitespace-only label as no reason at all', () => {
    expect(() =>
      resolveOfflineSaleLines([
        { ticketType: 'adult', quantity: 5, unitPriceCents: 1500, discountLabel: '   ' },
      ]),
    ).toThrow(/discount label/i)
  })

  it('allows a full-price line with no label', () => {
    const [line] = resolveOfflineSaleLines([
      { ticketType: 'adult', quantity: 5, unitPriceCents: 2000 },
    ])
    expect(line.discountLabel).toBeNull()
  })

  it('refuses a price above face value as a typo — there are no surcharges', () => {
    expect(() =>
      resolveOfflineSaleLines([{ ticketType: 'child', quantity: 1, unitPriceCents: 2000 }]),
    ).toThrow(/exceeds/i)
  })

  it('accepts a negative quantity: that is how a miscount is corrected', () => {
    const [line] = resolveOfflineSaleLines([{ ticketType: 'adult', quantity: -20 }])
    expect(line.quantity).toBe(-20)
  })

  it('refuses zero, fractional and non-numeric quantities', () => {
    expect(() => resolveOfflineSaleLines([{ ticketType: 'adult', quantity: 0 }])).toThrow(/non-zero/i)
    expect(() => resolveOfflineSaleLines([{ ticketType: 'adult', quantity: 1.5 }])).toThrow(/integer/i)
  })

  it('refuses an unknown ticket type and an empty batch', () => {
    expect(() =>
      // @ts-expect-error deliberately wrong
      resolveOfflineSaleLines([{ ticketType: 'senior', quantity: 1 }]),
    ).toThrow(/unknown ticket type/i)
    expect(() => resolveOfflineSaleLines([])).toThrow(/at least one line/i)
  })

  it('refuses a label longer than the column', () => {
    expect(() =>
      resolveOfflineSaleLines([
        {
          ticketType: 'adult',
          quantity: 1,
          unitPriceCents: 1500,
          discountLabel: 'x'.repeat(MAX_DISCOUNT_LABEL_LENGTH + 1),
        },
      ]),
    ).toThrow(/longer than/i)
  })

  it('refuses a negative or fractional price', () => {
    expect(() =>
      resolveOfflineSaleLines([{ ticketType: 'adult', quantity: 1, unitPriceCents: -1 }]),
    ).toThrow(/non-negative/i)
    expect(() =>
      resolveOfflineSaleLines([{ ticketType: 'adult', quantity: 1, unitPriceCents: 150.5 }]),
    ).toThrow(/non-negative/i)
  })
})

describe('sumOfflineLines', () => {
  it('adds up the real 08.06.2026 evening', () => {
    // 68 adults at face, 32 pensioners at €15. 100 people, €1840.
    const lines = resolveOfflineSaleLines([
      { ticketType: 'adult', quantity: 68 },
      { ticketType: 'adult', quantity: 32, unitPriceCents: 1500, discountLabel: 'umirovljenici' },
    ])
    expect(sumOfflineLines(lines)).toEqual({
      seats: 100,
      adult: 100,
      child: 0,
      revenueCents: 68 * 2000 + 32 * 1500,
      discountedSeats: 32,
    })
  })

  it('splits adult and child and never values a child at the adult price', () => {
    const lines = resolveOfflineSaleLines([
      { ticketType: 'adult', quantity: 83 },
      { ticketType: 'child', quantity: 6 },
    ])
    const totals = sumOfflineLines(lines)
    expect(totals).toMatchObject({ seats: 89, adult: 83, child: 6, discountedSeats: 0 })
    expect(totals.revenueCents).toBe(83 * 2000 + 6 * 1000)
  })

  it('lets a correction subtract from every figure', () => {
    const lines = resolveOfflineSaleLines([
      { ticketType: 'adult', quantity: 68 },
      { ticketType: 'adult', quantity: -20 },
    ])
    expect(sumOfflineLines(lines)).toMatchObject({ seats: 48, adult: 48, revenueCents: 48 * 2000 })
  })

  it('is zero for no lines', () => {
    expect(sumOfflineLines([])).toEqual({
      seats: 0,
      adult: 0,
      child: 0,
      revenueCents: 0,
      discountedSeats: 0,
    })
  })
})

describe('addOfflineTotals and netQuantity', () => {
  it('adds two totals field by field', () => {
    const a = sumOfflineLines(resolveOfflineSaleLines([{ ticketType: 'adult', quantity: 10 }]))
    const b = sumOfflineLines(resolveOfflineSaleLines([{ ticketType: 'child', quantity: 4 }]))
    expect(addOfflineTotals(a, b)).toEqual({
      seats: 14,
      adult: 10,
      child: 4,
      revenueCents: 10 * 2000 + 4 * 1000,
      discountedSeats: 0,
    })
  })

  it('nets a batch down to the counter delta', () => {
    const lines = resolveOfflineSaleLines([
      { ticketType: 'adult', quantity: 30 },
      { ticketType: 'child', quantity: 5 },
      { ticketType: 'adult', quantity: -3 },
    ])
    expect(netQuantity(lines)).toBe(32)
  })
})
