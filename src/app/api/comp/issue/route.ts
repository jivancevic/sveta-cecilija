import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { createCompIssue, CompIssueError } from '@/lib/comp/create-comp-issue'
import { buildCompIssueDeps, type CompIssuePayload } from '@/lib/comp/comp-issue-deps'
import { sendOrderTicketEmail, type OrderEmailPayload } from '@/lib/email/send-order-ticket-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/comp/issue — an admin issues free (comp) tickets to a society member
// for an active upcoming show (ADR-0019). `tickets` only: the local API runs
// overrideAccess, so this route re-checks the permission in-handler (CLAUDE.md
// hard rule). The member is required — attribution is the whole point.
export async function POST(req: NextRequest) {
  const gate = await requirePermission(req, 'tickets')
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

  // Today's date in the venue's timezone for the upcoming-show guard.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })

  try {
    const result = await createCompIssue(
      { memberId, showId, adults, children, today, buyerName, email },
      // The shared comp wiring (#434): the show read, the active-ticket count,
      // the seat lock, the order code and the order + ticket writes live in ONE
      // place, so /admin and /app cannot drift apart. `compIssuedBy: 'admin'` is
      // written explicitly rather than left to a column default — a default
      // would also label every online and partner order "Admin" in the list.
      buildCompIssueDeps(payload as unknown as CompIssuePayload, {
        memberId,
        compIssuedBy: 'admin',
      }),
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
