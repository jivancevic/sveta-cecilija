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
    // Idempotency ledger. NOTE the deliberate asymmetry with the rest of the
    // critical-events sink: `recordCriticalEvent` is best-effort BY CONTRACT and
    // swallows its own insert failure, which is right for a reporting sink and
    // wrong for a guard — a swallowed claim would silently let Stripe's retry
    // act a second time. So the claim writes directly and lets errors escape.
    // ON CONFLICT DO NOTHING resolves against the partial unique index on
    // (kind, context->>'disputeId') in db/schema/app.sql; without that index
    // this degrades to a plain insert and the guard stops working.
    claimEvent: async (kind, disputeId, context) => {
      const { rows } = await pool.query(
        `INSERT INTO critical_events (kind, context)
         VALUES ($1, $2::jsonb)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [kind, JSON.stringify({ ...context, disputeId })],
      )
      return rows.length > 0
    },
    releaseEvent: async (kind, disputeId) => {
      await pool.query(
        `DELETE FROM critical_events WHERE kind = $1 AND context->>'disputeId' = $2`,
        [kind, disputeId],
      )
    },
    // Enrichment only, after the money and tickets are already correct — so this
    // one IS best-effort, and reuses the swallowing sink writer on failure paths
    // by simply not throwing.
    finalizeEvent: async (kind, disputeId, context) => {
      try {
        await pool.query(
          `UPDATE critical_events SET context = $3::jsonb
            WHERE kind = $1 AND context->>'disputeId' = $2`,
          [kind, disputeId, JSON.stringify({ ...context, disputeId })],
        )
      } catch (err) {
        // Mirror recordCriticalEvent's contract: never turn reporting into a
        // second failure mode. The claim row (with its seed context) survives.
        console.error('[buildDisputeDeps] finalizeEvent failed', kind, disputeId, err)
        await recordCriticalEvent(
          { kind: 'stripe_dispute_finalize_failed', context: { kind, disputeId } },
          { query: pool.query },
        )
      }
    },
  }
}
