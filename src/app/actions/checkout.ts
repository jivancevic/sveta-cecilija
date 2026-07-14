'use server'

import type Stripe from 'stripe'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  createCheckoutSession,
  type CheckoutInput,
  type ResolvedPromoCode,
} from '@/lib/checkout/create-checkout-session'
import { createPaymentIntentWithPmcFallback } from '@/lib/checkout/create-payment-intent'
import { getStripe } from '@/lib/stripe'
import type { PurchasableShow } from '@/lib/checkout/purchasability'
import { getActiveTicketCountForShow, type PoolQuery } from '@/lib/tickets/sold-seats'
import type { Payload } from 'payload'

// Resolve a typed promo code to its record. Read with overrideAccess because
// PromoCodes read is admin-only, and the public checkout is unauthenticated;
// this is a trusted server-side read of a single code the guest typed (no PII),
// not a mutation, so the admin-only collection access doesn't apply here.
async function resolvePromoCode(
  payload: Payload,
  code: string,
): Promise<ResolvedPromoCode | null> {
  const trimmed = code.trim()
  if (!trimmed) return null
  const r = await payload.find({
    collection: 'promo-codes',
    where: { code: { equals: trimmed } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = r.docs[0]
  if (!doc) return null
  return {
    code: String(doc.code),
    adultPriceEur: Number(doc.adultPriceEur),
    active: Boolean(doc.active),
  }
}

// Client-side preview helper (ADR-0018): validates a typed code so the checkout
// UI can show the discounted price or an inline error. This is UX only — the
// authoritative recompute happens again in createCheckoutSession, which never
// trusts a client-supplied price.
export async function applyPromoCode(
  code: string,
): Promise<{ ok: true; adultPriceEur: number } | { ok: false }> {
  const payload = await getPayload({ config })
  const found = await resolvePromoCode(payload, code)
  if (!found || !found.active) return { ok: false as const }
  return { ok: true as const, adultPriceEur: found.adultPriceEur }
}

export async function startCheckout(input: CheckoutInput) {
  const payload = await getPayload({ config })
  const stripe = getStripe()
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool

  try {
    const session = await createCheckoutSession(input, {
      findPromoCode: (code) => resolvePromoCode(payload, code),
      findShow: async (id) => {
        try {
          const doc = await payload.findByID({ collection: 'shows', id, depth: 0 })
          return {
            id: String(doc.id),
            date: doc.date as string,
            time: doc.time as string,
            venue: doc.venue as PurchasableShow['venue'],
            // Sold seats = active tickets (online_sold column retired).
            activeTicketCount: await getActiveTicketCountForShow((sql, params) => pool.query(sql, params), doc.id as number),
            inPersonSold: (doc.inPersonSold as number) ?? 0,
            legacyReserved: (doc.legacyReserved as number) ?? 0,
            status: doc.status as 'active' | 'cancelled',
          }
        } catch {
          return null
        }
      },
      createPaymentIntent: async ({ amountCents, currency, metadata, receiptEmail }) => {
        // Pin the payment-method configuration so checkout always uses our curated
        // "Your account" config (Card + Apple Pay + Google Pay), not whichever config
        // happens to be the account default. This account carries leftover
        // WooCommerce-owned configs from the legacy Tickera site whose default surfaces
        // EU bank methods (iDEAL/Bancontact/EPS) and hides the wallets. PMC ids are
        // mode-specific, so the value is env-driven (live id in Coolify, sandbox id
        // locally); a mode-mismatched id gracefully falls back to the account default
        // rather than breaking checkout — see create-payment-intent.ts.
        return createPaymentIntentWithPmcFallback(
          (body) => stripe.paymentIntents.create(body as unknown as Stripe.PaymentIntentCreateParams),
          {
            amount: amountCents,
            currency,
            metadata,
            receipt_email: receiptEmail,
            automatic_payment_methods: { enabled: true },
          },
          process.env.STRIPE_PMC_ID,
        )
      },
    })
    return { ok: true as const, ...session }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return { ok: false as const, error: message }
  }
}
