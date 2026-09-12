import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import {
  cancelShow,
  previewCancel,
  refundModeFor,
  type CancelShowDeps,
  type CancelShowRow,
  type CancelOrderRow,
} from '@/lib/show-cancel'
import { sendShowCancelledEmail } from '@/lib/email/send-show-cancelled-email'
import { refundOrder } from '@/lib/refund-order'
import { buildRefundOrderDeps } from '@/lib/refund/build-refund-order-deps'
import { voidOrderTickets, type TicketVoidExecutor } from '@/lib/tickets/ticket-void'
import { recordCriticalEvent } from '@/lib/critical-events/record'
import { toIsoDate } from '@/lib/to-iso-date'
import { assertPublicPerformance } from '@/lib/show-admin-actions'
import { isPublicPerformance } from '@/lib/show-performance'
import { createPushDeps, type PushPayload } from '@/lib/push/push-data'
import { loadPerformanceFacts, notifyRawPerformanceSave } from '@/lib/push/raw-save'
import type { Payload } from 'payload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "Cancel performance, refund and notify every buyer" (#497).
//   GET  → preview: money to refund, partner seats leaving the statement, how
//          many buyers get mailed, and whether the row is already cancelled.
//   POST {}            → confirm: cancel, refund, void, mail. Safely re-runnable.
//   POST { test:true } → send the EN+HR notice to the caller only; no writes.
//
// Guarded on `refunds`, not `tickets`: this moves real money out of the account
// (ADR-0021's engine, key `refund:<paymentIntentId>`). The GET is readable by a
// `tickets` holder too, so the secretary can see what a cancellation would cost
// before asking someone who holds `refunds` to press the button.

type Pool = { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

function poolOf(payload: Payload): Pool {
  return (payload.db as unknown as { pool: Pool }).pool
}

// Money on an order is EUR cents; pg hands numeric columns back as strings.
function cents(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function buildDeps(payload: Payload, brevoApiKey: string): CancelShowDeps {
  const pool = poolOf(payload)
  const drizzle = (payload.db as unknown as { drizzle: TicketVoidExecutor }).drizzle
  return {
    getShow: async (showId): Promise<CancelShowRow | null> => {
      const res = await pool.query(
        `SELECT id, date, time, venue, is_public, status FROM shows WHERE id = $1`,
        [Number(showId)],
      )
      const row = res.rows[0]
      if (!row) return null
      return {
        id: String(row.id),
        // #409 — a non-public performance has no buyers; the seam rejects it
        // (and so does the test-send path below).
        isPublic: isPublicPerformance(row),
        // pg returns the timestamptz column as a JS Date — normalise to
        // YYYY-MM-DD (a raw String(date).slice would yield "Invalid Date").
        date: toIsoDate(row.date),
        time: String(row.time ?? ''),
        venue: row.venue === 'zimsko-kino' ? 'zimsko-kino' : 'ljetno-kino',
        cancelled: row.status === 'cancelled',
      }
    },
    findOrders: async (showId): Promise<CancelOrderRow[]> => {
      // EVERY order of the show, every channel, refunded or not: the refunded
      // ones still need their seats checked (the engine self-heals a stuck
      // void) and, if they were never told, their notice. One row per ORDER,
      // deliberately not deduped by email the way the reschedule notice is:
      // each order carries its own money, and a buyer with two orders on a
      // cancelled evening is owed two different refund lines.
      const res = await pool.query(
        `SELECT id, channel, buyer_name, email, locale, total,
                adult_count, child_count, refund_status, cancel_notified_at
           FROM orders
          WHERE show_id = $1
          ORDER BY id`,
        [Number(showId)],
      )
      return res.rows.map((r): CancelOrderRow => ({
        orderId: String(r.id),
        channel: r.channel === 'partner' ? 'partner' : r.channel === 'comp' ? 'comp' : 'online',
        buyerName: String(r.buyer_name ?? ''),
        email: typeof r.email === 'string' && r.email !== '' ? r.email : null,
        locale: r.locale === 'hr' ? 'hr' : r.locale === 'en' ? 'en' : null,
        totalCents: cents(r.total),
        seats: cents(r.adult_count) + cents(r.child_count),
        refunded: r.refund_status === 'refunded',
        notified: r.cancel_notified_at != null,
      }))
    },
    claimCancel: async (showId): Promise<boolean> => {
      // Atomic: only the call that finds the row still active flips it, so two
      // concurrent confirmations agree on which one "cancelled" it. The loser
      // still walks the orders — see the cancelShow header.
      const res = await pool.query(
        `UPDATE shows
            SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND status <> 'cancelled'
          RETURNING id`,
        [Number(showId)],
      )
      return res.rows.length > 0
    },
    refundOnlineOrder: async (orderId) => {
      // The shared engine: idempotent at Stripe, marks the order refunded, and
      // cascade-voids the order's tickets with cancel_reason='refund'. Its own
      // refund email is replaced below so the buyer gets ONE message that says
      // why the money is coming back, not a bare "your refund of €X".
      const deps = buildRefundOrderDeps(payload, '[cancel-show]')
      const result = await refundOrder({ orderId }, { ...deps, sendRefundEmail: async () => {} })
      return { refunded: result.refunded, amountCents: result.amountCents }
    },
    voidTickets: async (orderId) => {
      // Partner + comp seats leave the show as a storno, which is also what
      // takes a partner's seats off the monthly statement (ADR-0008).
      const { voided } = await voidOrderTickets(drizzle, orderId, 'storno')
      return voided
    },
    sendCancellationEmail: (order, show, mode) =>
      sendShowCancelledEmail(
        {
          orderId: order.orderId,
          buyer: { name: order.buyerName, email: String(order.email) },
          show,
          mode,
          amountCents: order.totalCents,
          locale: order.locale ?? 'en',
        },
        { fetch: globalThis.fetch, brevoApiKey },
      ),
    markNotified: async (orderId) => {
      await pool.query(`UPDATE orders SET cancel_notified_at = NOW() WHERE id = $1`, [Number(orderId)])
    },
    recordFailure: (kind, context) =>
      recordCriticalEvent({ kind, context }, { query: (sql, params) => pool.query(sql, params ?? []) }),
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, ['tickets', 'refunds'])
  if (gate.error) return gate.error
  const { payload } = gate
  const { id } = await params
  const deps = buildDeps(payload, process.env.BREVO_API_KEY ?? '')
  try {
    const preview = await previewCancel(id, deps)
    return NextResponse.json(preview)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview failed'
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'refunds')
  if (gate.error) return gate.error
  const { payload, user } = gate
  const { id } = await params

  const brevoApiKey = process.env.BREVO_API_KEY
  if (!brevoApiKey) {
    return NextResponse.json({ error: 'BREVO_API_KEY not configured' }, { status: 500 })
  }

  const body = (await req.json().catch(() => ({}))) as { test?: unknown }
  const deps = buildDeps(payload, brevoApiKey)

  // Test mode: the EN + HR notice to the caller's own inbox. No DB write, no
  // refund, no buyer mail — the "let me read it first" path, and the only
  // rehearsal available for an action that cannot be undone.
  if (body.test === true) {
    const adminEmail = typeof user.email === 'string' ? user.email : ''
    if (!adminEmail) {
      return NextResponse.json({ error: 'Your account has no email to send the test to.' }, { status: 400 })
    }
    try {
      const show = await deps.getShow(id)
      if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })
      // #409 — the test send bypasses cancelShow, so it needs its own gate.
      assertPublicPerformance(show as unknown as Record<string, unknown>)
      for (const locale of ['en', 'hr'] as const) {
        await sendShowCancelledEmail(
          {
            orderId: 'TEST',
            buyer: { name: 'Ivan Horvat', email: adminEmail },
            show: { date: show.date, time: show.time, venue: show.venue },
            // The online buyer's version, which is the one that carries money
            // and therefore the one worth proofreading.
            mode: refundModeFor('online'),
            amountCents: 4000,
            locale,
          },
          { fetch: globalThis.fetch, brevoApiKey },
        )
      }
      return NextResponse.json({ status: 'test-sent', to: adminEmail })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test send failed'
      return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 })
    }
  }

  const push = createPushDeps(payload as unknown as PushPayload)
  const before = await loadPerformanceFacts(push.query, id)
  try {
    const result = await cancelShow({ showId: id, userId: String(user.id) }, deps)

    // The cancel is a raw `UPDATE … RETURNING` claim, so no Payload hook fires
    // for it (#441): the roster is told here instead, from the row as it stood
    // before the claim and as it stands after. A cancelled evening is exactly
    // what a dancer must not learn on the pier. Never fails the request — the
    // money has already moved by the time this runs.
    await notifyRawPerformanceSave(id, before, push)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cancellation failed'
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 })
  }
}
