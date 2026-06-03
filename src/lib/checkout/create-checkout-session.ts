import { assertPurchasable, type PurchasableShow } from './purchasability'
import { calculateOrderTotal } from '../pricing'

export interface CheckoutInput {
  showId: string
  adults: number
  children: number
  buyer: { name: string; email: string }
  locale?: 'en' | 'hr'
}

export interface CheckoutDeps {
  findShow: (id: string) => Promise<PurchasableShow | null>
  createPaymentIntent: (args: {
    amountCents: number
    currency: 'eur'
    metadata: Record<string, string>
    receiptEmail: string
  }) => Promise<{ clientSecret: string; id: string }>
}

export interface CheckoutSession {
  clientSecret: string
  paymentIntentId: string
  totalCents: number
  totalEur: number
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function createCheckoutSession(
  input: CheckoutInput,
  deps: CheckoutDeps,
): Promise<CheckoutSession> {
  const name = input.buyer.name.trim()
  if (name.length === 0) throw new Error('Buyer name is required')
  if (!EMAIL_RE.test(input.buyer.email)) throw new Error('A valid email is required')

  const show = await deps.findShow(input.showId)
  if (!show) throw new Error('Show not found')

  assertPurchasable(show, { adults: input.adults, children: input.children })

  const totals = calculateOrderTotal({ adults: input.adults, children: input.children })

  const pi = await deps.createPaymentIntent({
    amountCents: totals.totalCents,
    currency: 'eur',
    receiptEmail: input.buyer.email,
    metadata: {
      showId: input.showId,
      adults: String(input.adults),
      children: String(input.children),
      buyerName: name,
      email: input.buyer.email,
      locale: input.locale ?? 'en',
    },
  })

  return {
    clientSecret: pi.clientSecret,
    paymentIntentId: pi.id,
    totalCents: totals.totalCents,
    totalEur: totals.totalEur,
  }
}
