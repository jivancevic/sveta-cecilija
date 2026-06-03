'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { createCheckoutSession, type CheckoutInput } from '@/lib/checkout/create-checkout-session'
import { getStripe } from '@/lib/stripe'
import type { PurchasableShow } from '@/lib/checkout/purchasability'
import { getActiveTicketCountForShow, type PoolQuery } from '@/lib/tickets/sold-seats'

export async function startCheckout(input: CheckoutInput) {
  const payload = await getPayload({ config })
  const stripe = getStripe()
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool

  try {
    const session = await createCheckoutSession(input, {
      findShow: async (id) => {
        try {
          const doc = await payload.findByID({ collection: 'shows', id, depth: 0 })
          return {
            id: String(doc.id),
            date: doc.date as string,
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
        const pi = await stripe.paymentIntents.create({
          amount: amountCents,
          currency,
          metadata,
          receipt_email: receiptEmail,
          automatic_payment_methods: { enabled: true },
        })
        return { id: pi.id, clientSecret: pi.client_secret ?? '' }
      },
    })
    return { ok: true as const, ...session }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return { ok: false as const, error: message }
  }
}
