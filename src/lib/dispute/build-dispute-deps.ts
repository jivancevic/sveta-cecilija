// Wiring of the pure dispute handler (#380) to the real Payload DB + Brevo.
// Extracted from the webhook route in the same shape as build-refund-order-deps
// so the route stays a thin adapter and the logic stays unit-testable.
//
// The ticket void deliberately reuses `voidOrderTickets(..., 'refund')` — the
// module that OWNS the void SQL — rather than hand-writing a second statement.
// A chargeback and a refund leave the ticket in the same terminal state (never
// restorable, unlike a storno), so `refund` is the honest cancel_reason.
import type { Payload } from 'payload'
import type { DisputedOrder, HandleDisputeDeps } from './handle-dispute'
import { voidOrderTickets, type TicketVoidExecutor } from '../tickets/ticket-void'
import { recordCriticalEvent } from '../critical-events/record'
import { sendDisputeNotification } from '../email/send-dispute-notification'
import type { PoolQuery } from '../tickets/sold-seats'

export interface DisputeDepsPool {
  query: PoolQuery
}

export function buildDisputeDeps(payload: Payload, pool: DisputeDepsPool): HandleDisputeDeps {
  return {
    findOrderByPaymentIntent: async (paymentIntentId): Promise<DisputedOrder | null> => {
      const r = await payload.find({
        collection: 'orders',
        where: { stripePaymentIntentId: { equals: paymentIntentId } },
        limit: 1,
        depth: 0,
      })
      const doc = r.docs[0]
      if (!doc) return null
      return {
        id: String(doc.id),
        code: doc.code ?? null,
        buyerName: doc.buyerName ?? null,
        email: doc.email ?? null,
        total: doc.total,
        refundStatus: (doc.refundStatus as 'none' | 'refunded') ?? 'none',
      }
    },
    markRefunded: async (orderId) => {
      await payload.update({ collection: 'orders', id: orderId, data: { refundStatus: 'refunded' } })
    },
    voidTickets: async (orderId) => {
      const drizzle = (payload.db as unknown as { drizzle: TicketVoidExecutor }).drizzle
      const { voided } = await voidOrderTickets(drizzle, orderId, 'refund')
      return voided
    },
    notifyAdmins: async (input) => {
      const brevoApiKey = process.env.BREVO_API_KEY
      if (!brevoApiKey) {
        // Loud, but not fatal: the critical-events row still lands, and failing
        // here would make Stripe retry an event we can never mail out.
        console.error('[stripe/webhook] BREVO_API_KEY not set — dispute alert not sent', input.disputeId)
        return
      }
      await sendDisputeNotification(input, { fetch, brevoApiKey })
    },
    // Idempotency ledger: the critical-events row written for a (kind, disputeId)
    // pair is what makes Stripe's at-least-once redelivery a no-op.
    hasHandled: async (kind, disputeId) => {
      const { rows } = await pool.query(
        `SELECT 1 FROM critical_events
          WHERE kind = $1 AND context->>'disputeId' = $2
          LIMIT 1`,
        [kind, disputeId],
      )
      return rows.length > 0
    },
    record: (kind, context) => recordCriticalEvent({ kind, context }, { query: pool.query }),
  }
}
