import { describe, it, expect, vi } from 'vitest'
import { createCheckoutSession } from './create-checkout-session'
import type { PurchasableShow } from './purchasability'

const futureDate = new Date(Date.now() + 7 * 86400000).toISOString()

const baseShow: PurchasableShow = {
  id: '1',
  date: futureDate,
  venue: 'ljetno-kino',
  activeTicketCount: 0,
  inPersonSold: 0,
  status: 'active',
}

function makeDeps(overrides?: { show?: PurchasableShow | null }) {
  const createPaymentIntent = vi.fn().mockResolvedValue({
    id: 'pi_test',
    clientSecret: 'pi_test_secret',
  })
  return {
    findShow: vi.fn().mockResolvedValue(overrides?.show === undefined ? baseShow : overrides.show),
    createPaymentIntent,
  }
}

describe('createCheckoutSession', () => {
  it('creates a PaymentIntent with the computed total + buyer metadata', async () => {
    const deps = makeDeps()
    const session = await createCheckoutSession(
      { showId: '1', adults: 2, children: 1, buyer: { name: 'Ana', email: 'a@b.co' } },
      deps,
    )
    expect(session.totalCents).toBe(5000)
    expect(deps.createPaymentIntent).toHaveBeenCalledWith({
      amountCents: 5000,
      currency: 'eur',
      receiptEmail: 'a@b.co',
      metadata: {
        showId: '1',
        adults: '2',
        children: '1',
        buyerName: 'Ana',
        email: 'a@b.co',
        locale: 'en',
      },
    })
  })

  it('propagates the buyer locale into PaymentIntent metadata', async () => {
    const deps = makeDeps()
    await createCheckoutSession(
      { showId: '1', adults: 1, children: 0, buyer: { name: 'A', email: 'a@b.co' }, locale: 'hr' },
      deps,
    )
    expect(deps.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ locale: 'hr' }),
      }),
    )
  })

  it('rejects when the show is missing or cancelled', async () => {
    await expect(
      createCheckoutSession(
        { showId: '99', adults: 1, children: 0, buyer: { name: 'X', email: 'x@y.z' } },
        makeDeps({ show: null }),
      ),
    ).rejects.toThrow('Show not found')

    await expect(
      createCheckoutSession(
        { showId: '1', adults: 1, children: 0, buyer: { name: 'X', email: 'x@y.z' } },
        makeDeps({ show: { ...baseShow, status: 'cancelled' } }),
      ),
    ).rejects.toThrow(/cancelled/i)
  })

  it('rejects when the requested quantity exceeds remaining capacity', async () => {
    await expect(
      createCheckoutSession(
        { showId: '1', adults: 5, children: 0, buyer: { name: 'X', email: 'x@y.z' } },
        makeDeps({ show: { ...baseShow, activeTicketCount: 318 } }),
      ),
    ).rejects.toThrow(/2 seats remaining/i)
  })

  it('rejects bad buyer input before touching Stripe', async () => {
    const deps = makeDeps()
    await expect(
      createCheckoutSession(
        { showId: '1', adults: 1, children: 0, buyer: { name: '', email: 'a@b.co' } },
        deps,
      ),
    ).rejects.toThrow(/name/i)
    expect(deps.createPaymentIntent).not.toHaveBeenCalled()

    await expect(
      createCheckoutSession(
        { showId: '1', adults: 1, children: 0, buyer: { name: 'X', email: 'not-an-email' } },
        deps,
      ),
    ).rejects.toThrow(/email/i)
  })

  describe('member promo code (ADR-0018)', () => {
    it('recomputes the discount server-side and carries the code in metadata', async () => {
      const deps = {
        ...makeDeps(),
        findPromoCode: vi.fn().mockResolvedValue({ code: 'ANA15', adultPriceEur: 15, active: true }),
      }
      // 5 adults: min(5×15 = 75, 4×20 = 80) = 75 => 7500 cents.
      const session = await createCheckoutSession(
        { showId: '1', adults: 5, children: 0, buyer: { name: 'Ana', email: 'a@b.co' }, promoCode: 'ANA15' },
        deps,
      )
      expect(session.totalCents).toBe(7500)
      expect(session.promoApplied).toBe(true)
      expect(deps.findPromoCode).toHaveBeenCalledWith('ANA15')
      expect(deps.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 7500,
          metadata: expect.objectContaining({ promoCode: 'ANA15' }),
        }),
      )
    })

    it('never trusts the client price: the amount comes from the server recompute', async () => {
      const deps = {
        ...makeDeps(),
        findPromoCode: vi.fn().mockResolvedValue({ code: 'ANA15', adultPriceEur: 15, active: true }),
      }
      // 2 adults: code 2×15 = 30 < standard 40 => 3000 cents.
      const session = await createCheckoutSession(
        { showId: '1', adults: 2, children: 0, buyer: { name: 'Ana', email: 'a@b.co' }, promoCode: 'ANA15' },
        deps,
      )
      expect(session.totalCents).toBe(3000)
      expect(session.promoApplied).toBe(true)
    })

    it('still attributes the code even when the 5-for-4 offer wins the price', async () => {
      const deps = {
        ...makeDeps(),
        // Weak code: adult stays €19, standard 5-for-4 (80) beats it (95).
        findPromoCode: vi.fn().mockResolvedValue({ code: 'WEAK', adultPriceEur: 19, active: true }),
      }
      const session = await createCheckoutSession(
        { showId: '1', adults: 5, children: 0, buyer: { name: 'Ana', email: 'a@b.co' }, promoCode: 'WEAK' },
        deps,
      )
      expect(session.totalCents).toBe(8000)
      // The code is still applied/attributed for member reporting.
      expect(session.promoApplied).toBe(true)
      expect(deps.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ promoCode: 'WEAK' }) }),
      )
    })

    it('ignores an inactive code and proceeds at the normal price without metadata', async () => {
      const deps = {
        ...makeDeps(),
        findPromoCode: vi.fn().mockResolvedValue({ code: 'OFF', adultPriceEur: 15, active: false }),
      }
      const session = await createCheckoutSession(
        { showId: '1', adults: 2, children: 0, buyer: { name: 'Ana', email: 'a@b.co' }, promoCode: 'OFF' },
        deps,
      )
      expect(session.totalCents).toBe(4000)
      expect(session.promoApplied).toBe(false)
      const meta = deps.createPaymentIntent.mock.calls[0][0].metadata
      expect(meta).not.toHaveProperty('promoCode')
    })

    it('ignores an unknown code and proceeds at the normal price', async () => {
      const deps = {
        ...makeDeps(),
        findPromoCode: vi.fn().mockResolvedValue(null),
      }
      const session = await createCheckoutSession(
        { showId: '1', adults: 2, children: 0, buyer: { name: 'Ana', email: 'a@b.co' }, promoCode: 'NOPE' },
        deps,
      )
      expect(session.totalCents).toBe(4000)
      expect(session.promoApplied).toBe(false)
      expect(deps.createPaymentIntent.mock.calls[0][0].metadata).not.toHaveProperty('promoCode')
    })

    it('does not resolve a code when none is entered', async () => {
      const deps = {
        ...makeDeps(),
        findPromoCode: vi.fn().mockResolvedValue(null),
      }
      const session = await createCheckoutSession(
        { showId: '1', adults: 2, children: 0, buyer: { name: 'Ana', email: 'a@b.co' } },
        deps,
      )
      expect(deps.findPromoCode).not.toHaveBeenCalled()
      expect(session.promoApplied).toBe(false)
    })
  })
})
