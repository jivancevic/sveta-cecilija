import { describe, it, expect, vi } from 'vitest'
import { createCheckoutSession } from './create-checkout-session'
import type { PurchasableShow } from '../capacity'

const futureDate = new Date(Date.now() + 7 * 86400000).toISOString()

const baseShow: PurchasableShow = {
  id: '1',
  date: futureDate,
  venue: 'ljetno-kino',
  onlineSold: 0,
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
      },
    })
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
        makeDeps({ show: { ...baseShow, onlineSold: 318 } }),
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
})
