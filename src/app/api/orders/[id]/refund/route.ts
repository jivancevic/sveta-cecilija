import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '@payload-config'
import { refundOrder, type RefundOrderRecord } from '@/lib/refund-order'
import { voidOrderTickets } from '@/lib/tickets/ticket-void'
import { sendRefundEmail } from '@/lib/email/send-refund-email'
import { getStripe } from '@/lib/stripe'
import type { Venue } from '@/lib/venues'
import { isAdminTier } from '@/lib/access/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })

  const { user } = await payload.auth({ headers: req.headers })
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminTier(user as { role?: string })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
        refundViaStripe: async ({ paymentIntentId, amountCents }) => {
          const stripe = getStripe()
          const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: amountCents,
          })
          return { id: refund.id }
        },
        markRefunded: async (orderId) => {
          await payload.update({
            collection: 'orders',
            id: orderId,
            data: { refundStatus: 'refunded' },
          })
        },
        voidTickets: async (orderId) => {
          const drizzle: any = (payload.db as any).drizzle
          const { voided } = await voidOrderTickets(orderId, 'refund', {
            atomicVoidActiveTickets: async (oid, reason) => {
              const res: any = await drizzle.execute(sql`
                UPDATE tickets
                SET status = 'cancelled',
                    cancelled_at = NOW(),
                    cancel_reason = ${reason},
                    updated_at = NOW()
                WHERE order_id = ${Number(oid)} AND status = 'active'
                RETURNING id
              `)
              return (res.rows ?? res).length
            },
          })
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
