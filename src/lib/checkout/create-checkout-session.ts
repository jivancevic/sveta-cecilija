import { assertPurchasable, type PurchasableShow } from './purchasability'
import { calculateOrderTotal } from '../pricing'

export interface CheckoutInput {
  showId: string
  adults: number
  children: number
  buyer: { name: string; email: string }
  locale?: 'en' | 'hr'
  /** Raw member promo code the guest typed (ADR-0018); validated server-side. */
  promoCode?: string
}

/** A resolved promo code (ADR-0018). `active` is honoured server-side. */
export interface ResolvedPromoCode {
  code: string
  adultPriceEur: number
  active: boolean
}

export interface CheckoutDeps {
  findShow: (id: string) => Promise<PurchasableShow | null>
  /** Resolves a typed promo code to its record, or null if it doesn't exist. */
  findPromoCode?: (code: string) => Promise<ResolvedPromoCode | null>
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
  /** True when a valid, active promo code was applied to this order. */
  promoApplied: boolean
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

  // Resolve the promo code SERVER-SIDE (never trust a client-computed price).
  // An unknown or inactive code is silently ignored and the order proceeds at
  // the normal price (ADR-0018): a bad code never blocks checkout. A valid,
  // active code is attributed even when the standard 5-for-4 offer wins the
  // best-of-two, so member reporting counts the guest's whole party.
  let promo: { adultPriceEur: number } | null = null
  let appliedCode: string | null = null
  const rawCode = input.promoCode?.trim()
  if (rawCode && deps.findPromoCode) {
    const found = await deps.findPromoCode(rawCode)
    if (found && found.active) {
      promo = { adultPriceEur: found.adultPriceEur }
      appliedCode = found.code
    }
  }

  const totals = calculateOrderTotal(
    { adults: input.adults, children: input.children },
    promo,
  )

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
      // Only present when a valid, active code was applied; the webhook resolves
      // it back to the PromoCodes record and links it to the Order.
      ...(appliedCode ? { promoCode: appliedCode } : {}),
    },
  })

  return {
    clientSecret: pi.clientSecret,
    paymentIntentId: pi.id,
    totalCents: totals.totalCents,
    totalEur: totals.totalEur,
    promoApplied: appliedCode !== null,
  }
}
