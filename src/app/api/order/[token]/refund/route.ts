import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { refundOrder, type RefundOrderRecord } from '@/lib/refund-order'
import { createStripeRefund } from '@/lib/refund/create-stripe-refund'
import { voidOrderTickets, type TicketVoidExecutor } from '@/lib/tickets/ticket-void'
import { sendRefundEmail } from '@/lib/email/send-refund-email'
import { getStripe } from '@/lib/stripe'
import {
  resolveRescheduleRefund,
  type RefundContextPool,
} from '@/lib/refund/reschedule-refund-context'
import { refundRateLimiter, clientIpFromHeaders } from '@/lib/rate-limit/refund-rate-limit'
import type { Venue } from '@/lib/venues'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/order/[token]/refund — UNAUTHENTICATED self-serve refund (ADR-0021).
// A buyer whose show was rescheduled cancels + refunds their OWN order from the
// link in the reschedule email. Authorization is the signed per-order HMAC token
// (verifyRescheduleRefundToken) — the sanctioned token/signature exception to the
// requireRole rule (alongside the Stripe webhook, /scan/[token]/claim, unsubscribe,
// cron). Every eligibility condition is RE-CHECKED here server-side; the client is
// never trusted. Reuses the same refundOrder() engine as the admin refund route.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Throttle before any DB work so a flood on a leaked token is cheap to reject.
  const rate = refundRateLimiter.check(token, clientIpFromHeaders(req.headers))
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  const secret = process.env.PAYLOAD_SECRET
  if (!secret) {
    // Should never happen (required at boot), but never sign/verify with a blank key.
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: RefundContextPool }).pool

  // Verify token + re-derive every eligibility condition from the DB.
  const { state, ctx } = await resolveRescheduleRefund(token, secret, pool)
  if (state !== 'ELIGIBLE' || !ctx) {
    // 404 for a bad/unknown token; 409 for a real order that just isn't refundable
    // (already refunded, scanned, not-online, not-rescheduled). The page already
    // renders these states; this guards a direct/stale POST.
    const status = state === 'INVALID' ? 404 : 409
    return NextResponse.json({ error: 'Refund not available', state }, { status })
  }

  const brevoApiKey = process.env.BREVO_API_KEY

  try {
    const result = await refundOrder(
      { orderId: ctx.order.id },
      {
        getOrder: async (orderId): Promise<RefundOrderRecord | null> => {
          const doc = await payload
            .findByID({ collection: 'orders', id: orderId, depth: 1 })
            .catch(() => null)
          if (!doc) return null
          const show = typeof doc.show === 'object' && doc.show !== null
            ? (doc.show as { id: string | number; date: string; time: string; venue: Venue })
            : null
          if (!show) return null
          return {
            id: String(doc.id),
            buyerName: doc.buyerName,
            email: doc.email,
            total: doc.total,
            stripePaymentIntentId: doc.stripePaymentIntentId ?? null,
            refundStatus: (doc.refundStatus as 'none' | 'refunded') ?? 'none',
            show: {
              id: String(show.id),
              date: typeof show.date === 'string' ? show.date.slice(0, 10) : '',
              time: show.time,
              venue: show.venue,
            },
          }
        },
        refundViaStripe: ({ paymentIntentId, amountCents }) =>
          createStripeRefund(getStripe(), { paymentIntentId, amountCents }),
        markRefunded: async (orderId) => {
          await payload.update({ collection: 'orders', id: orderId, data: { refundStatus: 'refunded' } })
        },
        voidTickets: async (orderId) => {
          const drizzle = (payload.db as unknown as { drizzle: TicketVoidExecutor }).drizzle
          const { voided } = await voidOrderTickets(drizzle, orderId, 'refund')
          return voided
        },
        sendRefundEmail: async (input) => {
          if (!brevoApiKey) {
            console.error(`[self-refund] BREVO_API_KEY not set — skipping email for orderId=${input.orderId}`)
            return
          }
          await sendRefundEmail(input, { fetch, brevoApiKey })
        },
      },
    )
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refund failed'
    console.error(`[self-refund] failed orderId=${ctx.order.id} error=${message}`)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
