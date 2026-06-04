import { NextRequest, NextResponse } from 'next/server'
import { isAdminTier, isPartner, partnerIdOf } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import {
  performRestore,
  RestoreError,
  SEAT_TAKEN,
  type RestoreActor,
  type RestoreTarget,
} from '@/lib/partner/restore'
import {
  reactivateOrderTickets,
  reactivateSingleTicket,
  type TicketVoidExecutor,
} from '@/lib/tickets/ticket-void'
import { VENUE_CAPACITY, type Venue } from '@/lib/venues'
import { getActiveTicketCountForShow, type PoolQuery } from '@/lib/tickets/sold-seats'
import { withShowSellLock, type SellLockPool } from '@/lib/tickets/sell-lock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/partner/storno/undo — restore (un-storno) a partner sale or a single
// ticket (ADR-0017, #146). Body: { orderId: string, ticketId?: string }.
// Whole-order when ticketId is omitted. Success: { restored: number }.
//
// Local API runs overrideAccess, so this route re-derives the actor from the
// session and the order's owner from the DB, then defers ALL policy (ownership +
// same-day Europe/Zagreb window for partners; unrestricted for admins) to the
// pure restore module with an injected clock. Re-activating tickets re-takes
// seats, so the count→capacity-check→reactivate critical section runs under the
// same per-show advisory sell lock as a sale; it rejects with SEAT_TAKEN if the
// freed seat was resold in the interim.
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

  // Load the order: we need its creation instant (the window anchor), owner, and
  // the show's capacity inputs (venue + in-person/legacy seats already taken).
  const order = await payload
    .findByID({ collection: 'orders', id: orderId, depth: 1 })
    .catch(() => null)
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  const orderPartnerRaw = (order as { partner?: { id?: number | string } | number | string | null })
    .partner
  const orderPartnerId =
    orderPartnerRaw && typeof orderPartnerRaw === 'object'
      ? (orderPartnerRaw.id ?? null)
      : (orderPartnerRaw ?? null)
  const orderCreatedAt = (order as { createdAt?: string }).createdAt ?? ''

  const showRaw = (order as { show?: { id?: number | string; venue?: string } | number | string })
    .show
  const show = showRaw && typeof showRaw === 'object' ? showRaw : null
  const showId = Number(show?.id ?? showRaw)
  if (!Number.isFinite(showId)) {
    return NextResponse.json({ error: 'Order has no show' }, { status: 404 })
  }
  const venue = show?.venue as Venue | undefined
  const capacity = venue ? VENUE_CAPACITY[venue] : undefined
  if (capacity == null) {
    return NextResponse.json({ error: 'Unknown venue' }, { status: 404 })
  }
  const inPersonSold = (show as { inPersonSold?: number } | null)?.inPersonSold ?? 0
  const legacyReserved = (show as { legacyReserved?: number } | null)?.legacyReserved ?? 0

  // If a single ticket is targeted, it must belong to this order — otherwise a
  // partner could restore a ticket of another order by pairing it with their own.
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

  const actor: RestoreActor = admin
    ? { kind: 'admin' }
    : { kind: 'partner', partnerId: callerPartnerId! }
  const target: RestoreTarget = ticketId ? { kind: 'ticket', ticketId } : { kind: 'order' }

  const drizzle = (payload.db as unknown as { drizzle: TicketVoidExecutor }).drizzle
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } & SellLockPool }).pool

  try {
    const { restored } = await performRestore(
      { orderCreatedAt, now: new Date(), actor, orderPartnerId, target },
      {
        // Serialize count→capacity-check→reactivate under the per-show sell lock
        // so a concurrent partner sell (or online webhook insert) can't be
        // oversold by the seats this restore re-takes.
        restore: () =>
          withShowSellLock(pool, showId, async () => {
            // N = how many tickets this restore WOULD re-activate (storno-cancelled
            // rows of the order, or just the single ticket).
            const n = await countRestorableTickets(pool.query, orderId, ticketId)
            if (n === 0) return 0

            const activeCount = await getActiveTicketCountForShow(
              (sql, params) => pool.query(sql, params),
              showId,
            )
            const remaining = capacity - activeCount - inPersonSold - legacyReserved
            if (remaining < n) throw SEAT_TAKEN

            const res = ticketId
              ? await reactivateSingleTicket(drizzle, ticketId)
              : await reactivateOrderTickets(drizzle, orderId)
            return res.restored
          }),
      },
    )
    return NextResponse.json({ restored })
  } catch (err) {
    if (err instanceof RestoreError) {
      const status = err.code === 'NOT_OWNER' ? 403 : 409
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    console.error('[partner/storno/undo] unexpected error', err)
    return NextResponse.json({ error: 'Could not undo the cancellation' }, { status: 500 })
  }
}

/** Count this order's (or the single ticket's) storno-cancelled, restorable rows. */
async function countRestorableTickets(
  query: PoolQuery,
  orderId: string,
  ticketId: string | undefined,
): Promise<number> {
  if (ticketId) {
    const res = await query(
      `SELECT COUNT(*)::int AS n
       FROM tickets
       WHERE id = $1 AND order_id = $2 AND status = 'cancelled' AND cancel_reason = 'storno'`,
      [Number(ticketId), Number(orderId)],
    )
    return Number(res.rows[0]?.n ?? 0)
  }
  const res = await query(
    `SELECT COUNT(*)::int AS n
     FROM tickets
     WHERE order_id = $1 AND status = 'cancelled' AND cancel_reason = 'storno'`,
    [Number(orderId)],
  )
  return Number(res.rows[0]?.n ?? 0)
}
