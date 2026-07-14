import { NextRequest, NextResponse } from 'next/server'
import { isAdminTier } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import { cancelComp, CancelCompError, type CancelCompOrder } from '@/lib/comp/cancel-comp'
import { voidOrderTickets, voidSingleTicket, type TicketVoidExecutor } from '@/lib/tickets/ticket-void'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/comp/cancel — an admin voids a whole comp order or a single comp
// ticket issued in error (ADR-0019, #321). Body: { orderId: string, ticketId?:
// string }; whole-order when ticketId is omitted.
//
// Admin-tier only, NO time window (the same-day window is partner self-service,
// not an admin rule). The local API runs overrideAccess, so the role is
// re-checked in-handler via requireRole (CLAUDE.md hard rule). This is the
// admin-only, comp-scoped counterpart to the partner /api/partner/storno route:
// it reuses the SAME void primitive with reason='storno' (comp voids are
// distinguished by channel='comp', so no new enum value), refuses to touch a
// paid online or partner order, and frees the seat via the active-ticket count
// so it re-enters remaining capacity + the per-show comp count immediately. A
// voided comp slip then scans to a clear CANCELLED state (scan-token).
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload } = gate

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

  const drizzle = (payload.db as unknown as { drizzle: TicketVoidExecutor }).drizzle

  try {
    const { voided } = await cancelComp(
      { orderId, target: ticketId ? { kind: 'ticket', ticketId } : { kind: 'order' } },
      {
        loadOrder: async (id): Promise<CancelCompOrder | null> => {
          const doc = await payload.findByID({ collection: 'orders', id, depth: 0 }).catch(() => null)
          if (!doc) return null
          return { channel: ((doc as { channel?: CancelCompOrder['channel'] }).channel ?? 'online') }
        },
        ticketOrderId: async (tid) => {
          const t = await payload.findByID({ collection: 'tickets', id: tid, depth: 0 }).catch(() => null)
          if (!t) return null
          const oid = (t as { order?: number | string }).order
          return oid == null ? null : String(oid)
        },
        // Idempotent, race-safe void (WHERE status='active'); reason='storno'.
        voidOrder: async () => (await voidOrderTickets(drizzle, orderId, 'storno')).voided,
        voidTicket: async (tid) => (await voidSingleTicket(drizzle, tid, 'storno')).voided,
      },
    )
    return NextResponse.json({ voided })
  } catch (err) {
    if (err instanceof CancelCompError) {
      const status =
        err.code === 'ORDER_NOT_FOUND' || err.code === 'TICKET_NOT_IN_ORDER'
          ? 404
          : err.code === 'NOT_A_COMP'
            ? 400
            : 409 // NOTHING_TO_VOID
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    console.error('[comp/cancel] unexpected error', err)
    return NextResponse.json({ error: 'Could not cancel the comp' }, { status: 500 })
  }
}
