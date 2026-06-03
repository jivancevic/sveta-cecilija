import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@payloadcms/db-postgres'
import { isAdminTier, isPartner, partnerIdOf } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import { performStorno, StornoError, type StornoActor, type StornoTarget } from '@/lib/partner/storno'
import { voidOrderTickets, voidSingleTicket } from '@/lib/tickets/ticket-void'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/partner/storno — cancel (storno) a partner sale or a single ticket.
// Body: { orderId: string, ticketId?: string }. Whole-order when ticketId is omitted.
//
// Local API runs overrideAccess, so this route re-derives the actor from the
// session and the order's owner from the DB, then defers ALL policy (ownership +
// same-day Europe/Zagreb window for partners; unrestricted for admins) to the
// pure storno module with an injected clock. The actual void is idempotent and
// race-safe (WHERE status='active'); seats free automatically.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, (u) => isAdminTier(u) || isPartner(u))
  if (gate.error) return gate.error
  const { payload, user } = gate

  const admin = isAdminTier(user as { role?: string })
  const partner = isPartner(user as { role?: string })

  // A partner login must be bound to a partner record; otherwise it owns nothing.
  const callerPartnerId = partner
    ? partnerIdOf(user as { role?: string; partner?: unknown } | null)
    : undefined
  if (partner && callerPartnerId == null) {
    return NextResponse.json({ error: 'Account not linked to a partner' }, { status: 403 })
  }

  let body: { orderId?: unknown; ticketId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const orderId = body.orderId == null ? '' : String(body.orderId)
  const ticketId = body.ticketId == null ? undefined : String(body.ticketId)
  if (!orderId) {
    return NextResponse.json({ error: 'Missing order' }, { status: 400 })
  }

  // Load the order: we need its creation instant (the window anchor) and owner.
  const order = await payload
    .findByID({ collection: 'orders', id: orderId, depth: 0 })
    .catch(() => null)
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  const orderPartnerId = (order as { partner?: number | string | null }).partner ?? null
  const orderCreatedAt = (order as { createdAt?: string }).createdAt ?? ''

  // If a single ticket is targeted, it must belong to this order — otherwise a
  // partner could void a ticket of another order by pairing it with their own.
  if (ticketId) {
    const ticket = await payload
      .findByID({ collection: 'tickets', id: ticketId, depth: 0 })
      .catch(() => null)
    const ticketOrderId = ticket
      ? String((ticket as { order?: number | string }).order ?? '')
      : ''
    if (!ticket || ticketOrderId !== String(orderId)) {
      return NextResponse.json({ error: 'Ticket not found for this order' }, { status: 404 })
    }
  }

  const actor: StornoActor = admin
    ? { kind: 'admin' }
    : { kind: 'partner', partnerId: callerPartnerId! }
  const target: StornoTarget = ticketId ? { kind: 'ticket', ticketId } : { kind: 'order' }

  const drizzle: { execute: (q: unknown) => Promise<{ rows?: unknown[] }> } = (
    payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows?: unknown[] }> } }
  ).drizzle

  try {
    const { voided } = await performStorno(
      { orderCreatedAt, now: new Date(), actor, orderPartnerId, target },
      {
        voidOrder: async () => {
          const r = await voidOrderTickets(orderId, 'storno', {
            atomicVoidActiveTickets: async (oid, reason) => {
              const res = await drizzle.execute(sql`
                UPDATE tickets
                SET status = 'cancelled',
                    cancelled_at = NOW(),
                    cancel_reason = ${reason},
                    updated_at = NOW()
                WHERE order_id = ${Number(oid)} AND status = 'active'
                RETURNING id
              `)
              return (res.rows ?? []).length
            },
          })
          return r.voided
        },
        voidTicket: async (tid) => {
          const r = await voidSingleTicket(tid, 'storno', {
            atomicVoidActiveTicket: async (id, reason) => {
              const res = await drizzle.execute(sql`
                UPDATE tickets
                SET status = 'cancelled',
                    cancelled_at = NOW(),
                    cancel_reason = ${reason},
                    updated_at = NOW()
                WHERE id = ${Number(id)} AND status = 'active'
                RETURNING id
              `)
              return (res.rows ?? []).length
            },
          })
          return r.voided
        },
      },
    )
    return NextResponse.json({ voided })
  } catch (err) {
    if (err instanceof StornoError) {
      const status = err.code === 'NOT_OWNER' ? 403 : err.code === 'WINDOW_CLOSED' ? 409 : 409
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    console.error('[partner/storno] unexpected error', err)
    return NextResponse.json({ error: 'Could not cancel the sale' }, { status: 500 })
  }
}
