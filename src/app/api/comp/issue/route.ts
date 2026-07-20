import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { isAdminTier } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import {
  createCompIssue,
  CompIssueError,
  type CompIssueShow,
} from '@/lib/comp/create-comp-issue'
import { VENUE_CAPACITY, type Venue } from '@/lib/venues'
import { sendOrderTicketEmail, type OrderEmailPayload } from '@/lib/email/send-order-ticket-email'
import { getActiveTicketCountForShow, type PoolQuery } from '@/lib/tickets/sold-seats'
import { withShowSellLock, type SellLockPool } from '@/lib/tickets/sell-lock'
import { generateQrToken } from '@/lib/qr-token'
import { generateOrderCode as makeOrderCode } from '@/lib/tickets/order-code'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/comp/issue — an admin issues free (comp) tickets to a society member
// for an active upcoming show (ADR-0019). Admin-tier only: the local API runs
// overrideAccess, so this route re-checks the role in-handler (CLAUDE.md hard
// rule). The member is required — attribution is the whole point.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload } = gate

  let body: {
    showId?: unknown
    memberId?: unknown
    adults?: unknown
    children?: unknown
    buyerName?: unknown
    email?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const showId = Number(body.showId)
  const memberId = Number(body.memberId)
  const adults = Number(body.adults)
  const children = Number(body.children)
  const buyerName = typeof body.buyerName === 'string' ? body.buyerName : null
  const email = typeof body.email === 'string' ? body.email : null
  if (!Number.isFinite(showId)) {
    return NextResponse.json({ error: 'Invalid show' }, { status: 400 })
  }
  if (!Number.isFinite(memberId) || memberId <= 0) {
    return NextResponse.json({ error: 'Member is required', code: 'MEMBER_REQUIRED' }, { status: 400 })
  }

  // The member must exist (it drives per-member reporting). Fail cleanly if not.
  const memberRecord = await payload
    .findByID({ collection: 'members', id: memberId, depth: 0 })
    .catch(() => null)
  if (!memberRecord) {
    return NextResponse.json({ error: 'Member not found', code: 'MEMBER_REQUIRED' }, { status: 400 })
  }

  const pool = (payload.db as unknown as { pool: { query: PoolQuery } & SellLockPool }).pool
  // Today's date in the venue's timezone for the upcoming-show guard.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })

  try {
    const result = await createCompIssue(
      { memberId, showId, adults, children, today, buyerName, email },
      {
        loadShow: async (id): Promise<CompIssueShow | null> => {
          const doc = await payload.findByID({ collection: 'shows', id, depth: 0 }).catch(() => null)
          if (!doc) return null
          const venue = doc.venue as Venue
          return {
            id: Number(doc.id),
            date: doc.date as string,
            status: doc.status as 'active' | 'cancelled',
            capacity: VENUE_CAPACITY[venue],
            inPersonSold: (doc.inPersonSold as number) ?? 0,
            legacyReserved: (doc.legacyReserved as number) ?? 0,
          }
        },
        countActiveTickets: (id) =>
          getActiveTicketCountForShow((sql, params) => pool.query(sql, params), id),
        // Same per-show advisory lock partner sells use, so comps participate in
        // the shared oversell serialization.
        withSeatLock: (sid, critical) => withShowSellLock(pool, sid, critical),
        generateOrderCode: () =>
          makeOrderCode({
            isUnique: async (code) => {
              const r = await payload.find({
                collection: 'orders',
                where: { code: { equals: code } },
                limit: 1,
                depth: 0,
              })
              return r.docs.length === 0
            },
            randomInt: (max) => randomInt(max),
          }),
        generateToken: generateQrToken,
        persist: async ({ order, tickets }) => {
          const orderDoc = await payload.create({
            collection: 'orders',
            data: {
              code: order.code,
              channel: 'comp',
              member: memberId,
              buyerName: order.buyerName,
              email: order.email,
              adultCount: order.adultCount,
              childCount: order.childCount,
              total: order.totalCents,
              refundStatus: 'none',
              show: order.showId,
              locale: order.locale,
            },
          })
          // One row per person, sequential so serial ids stay in issuance order
          // (the PDF derives CODE-N from that order).
          for (const t of tickets) {
            await payload.create({
              collection: 'tickets',
              data: { token: t.token, type: t.type, status: 'active', order: Number(orderDoc.id) },
            })
          }
          return { orderId: String(orderDoc.id) }
        },
      },
    )

    // Send the ticket email to the recipient the admin entered, if any. The
    // order + tickets are already committed above — this is best-effort and
    // never rolls the comp back. We AWAIT it (rather than fire-and-forget) so
    // the response carries the TRUE outcome and the form banner can say whether
    // the mail actually left ('sent' / 'skipped' when no email / 'failed').
    // sendOrderTicketEmail never throws (it maps every failure to a status),
    // so no try/catch here — a bad email can't roll the committed comp back.
    const emailResult = await sendOrderTicketEmail(
      payload as unknown as OrderEmailPayload,
      result.orderId,
    )

    return NextResponse.json({
      orderId: result.orderId,
      code: result.code,
      adultCount: result.adultCount,
      childCount: result.childCount,
      ticketCount: result.tickets.length,
      emailStatus: emailResult.status,
      emailTo: emailResult.email,
    })
  } catch (err) {
    if (err instanceof CompIssueError) {
      const status = err.code === 'OVERSELL' ? 409 : 400
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    console.error('[comp/issue] unexpected error', err)
    return NextResponse.json({ error: 'Could not issue the comp tickets' }, { status: 500 })
  }
}
