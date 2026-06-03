import { NextRequest, NextResponse } from 'next/server'
import { refundOrder, type RefundOrderRecord } from '@/lib/refund-order'
import { createStripeRefund } from '@/lib/refund/create-stripe-refund'
import { voidOrderTickets, type TicketVoidExecutor } from '@/lib/tickets/ticket-void'
import { sendRefundEmail } from '@/lib/email/send-refund-email'
import { getStripe } from '@/lib/stripe'
import type { Venue } from '@/lib/venues'
import { isAdminTier } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload } = gate

  const { id } = await params

  try {
    const result = await refundOrder(
      { orderId: id },
      {
        getOrder: async (orderId): Promise<RefundOrderRecord | null> => {
          const doc = await payload
            .findByID({ collection: 'orders', id: orderId, depth: 1 })
            .catch(() => null)
          if (!doc) return null
          const show = typeof doc.show === 'object' && doc.show !== null
            ? doc.show as { id: string | number; date: string; time: string; venue: Venue }
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
          await payload.update({
            collection: 'orders',
            id: orderId,
            data: { refundStatus: 'refunded' },
          })
        },
        voidTickets: async (orderId) => {
          const drizzle = (payload.db as unknown as { drizzle: TicketVoidExecutor }).drizzle
          const { voided } = await voidOrderTickets(drizzle, orderId, 'refund')
          return voided
        },
        sendRefundEmail: async (input) => {
          const apiKey = process.env.BREVO_API_KEY
          if (!apiKey) {
            console.error(`[refund] BREVO_API_KEY not set — skipping email for orderId=${input.orderId}`)
            return
          }
          await sendRefundEmail(input, { fetch, brevoApiKey: apiKey })
        },
      },
    )
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refund failed'
    const status = /not found/i.test(message) ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
