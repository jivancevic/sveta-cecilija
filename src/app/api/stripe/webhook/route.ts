import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getPayload } from 'payload'
import config from '@payload-config'
import { handlePaymentSucceeded } from '@/lib/checkout/handle-payment-succeeded'
import { generateQrToken } from '@/lib/qr-token'
import type { PurchasableShow } from '@/lib/capacity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Signature verification does not require a real API key — Stripe SDK only
// needs the webhook signing secret for `constructEvent`. We keep the API key
// check separate so a missing key doesn't mask signature-rejection (returning
// 500 where a 400 belongs).
const signatureVerifier = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_placeholder')

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const rawBody = await req.text()

  let event
  try {
    event = signatureVerifier.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    return NextResponse.json({ error: `Signature verification failed: ${message}` }, { status: 400 })
  }

  if (event.type !== 'payment_intent.succeeded') {
    return NextResponse.json({ received: true })
  }

  const pi = event.data.object as {
    id: string
    amount_received: number
    metadata: Record<string, string>
  }

  const payload = await getPayload({ config })

  try {
    await handlePaymentSucceeded(
      {
        paymentIntentId: pi.id,
        amountReceived: pi.amount_received,
        metadata: pi.metadata ?? {},
      },
      {
        findOrderByPaymentIntent: async (id) => {
          const r = await payload.find({
            collection: 'orders',
            where: { stripePaymentIntentId: { equals: id } },
            limit: 1,
            depth: 0,
          })
          return r.docs[0] ? { id: String(r.docs[0].id) } : null
        },
        findShow: async (id): Promise<PurchasableShow | null> => {
          try {
            const doc = await payload.findByID({ collection: 'shows', id, depth: 0 })
            return {
              id: String(doc.id),
              date: doc.date as string,
              venue: doc.venue as PurchasableShow['venue'],
              onlineSold: (doc.onlineSold as number) ?? 0,
              inPersonSold: (doc.inPersonSold as number) ?? 0,
              status: doc.status as 'active' | 'cancelled',
            }
          } catch {
            return null
          }
        },
        createOrder: async (input) => {
          const showRef = Number.isFinite(Number(input.show)) ? Number(input.show) : input.show
          const doc = await payload.create({
            collection: 'orders',
            data: { ...input, show: showRef as number },
          })
          return { id: String(doc.id) }
        },
        createQrToken: async (input) => {
          const orderRef = Number.isFinite(Number(input.order)) ? Number(input.order) : input.order
          await payload.create({
            collection: 'qr-tokens',
            data: { ...input, order: orderRef as number },
          })
        },
        incrementOnlineSold: async (showId, by) => {
          const id = Number.isFinite(Number(showId)) ? Number(showId) : showId
          const doc = await payload.findByID({ collection: 'shows', id, depth: 0 })
          await payload.update({
            collection: 'shows',
            id,
            data: { onlineSold: ((doc.onlineSold as number) ?? 0) + by },
          })
        },
        generateToken: generateQrToken,
      },
    )
    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook handler error'
    console.error('[stripe/webhook]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
