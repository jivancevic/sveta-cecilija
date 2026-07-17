// Shared wiring of the refundOrder() engine to the real Payload DB + Stripe +
// Brevo. Extracted (#reschedule / ADR-0021) so the admin refund route
// (/api/orders/[id]/refund) and the buyer self-serve route
// (/api/order/[token]/refund) drive the SAME plumbing — refunds move real money,
// so the void/mark/email sequence must not silently diverge between the two.
// The only per-caller difference is the log tag on a skipped email.
import type { Payload } from 'payload'
import { type RefundOrderDeps, type RefundOrderRecord } from '../refund-order'
import { createStripeRefund } from './create-stripe-refund'
import { voidOrderTickets, type TicketVoidExecutor } from '../tickets/ticket-void'
import { sendRefundEmail } from '../email/send-refund-email'
import { getStripe } from '../stripe'
import type { Venue } from '../venues'

export function buildRefundOrderDeps(payload: Payload, logTag: string): RefundOrderDeps {
  return {
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
      const apiKey = process.env.BREVO_API_KEY
      if (!apiKey) {
        console.error(`${logTag} BREVO_API_KEY not set — skipping email for orderId=${input.orderId}`)
        return
      }
      await sendRefundEmail(input, { fetch, brevoApiKey: apiKey })
    },
  }
}
