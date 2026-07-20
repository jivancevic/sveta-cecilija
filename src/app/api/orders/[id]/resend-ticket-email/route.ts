import { NextRequest, NextResponse } from 'next/server'
import { isAdminTier } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import {
  sendOrderTicketEmail,
  type OrderEmailPayload,
} from '@/lib/email/send-order-ticket-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/orders/[id]/resend-ticket-email — re-send an order's ticket PDF to
// the address currently on the order (Order.email). Admin-tier only: the local
// API runs overrideAccess, so this route re-checks the role in-handler
// (CLAUDE.md hard rule). It always sends to the persisted email — to fix a wrong
// or missing address the admin edits the Order's email field first, then resends
// (no inline email input by design). Works for any channel that has an email;
// comp slips render "Complimentary" and partner slips keep their SOLD BY row.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload } = gate

  const { id } = await params

  // sendOrderTicketEmail never throws — it maps every failure to a status.
  const result = await sendOrderTicketEmail(payload as unknown as OrderEmailPayload, id)

  if (result.status === 'skipped') {
    return NextResponse.json(
      { status: 'skipped', error: 'This order has no email on file. Add one, then resend.' },
      { status: 400 },
    )
  }
  if (result.status === 'failed') {
    return NextResponse.json(
      { status: 'failed', error: 'The email could not be sent. Check the logs and try again.' },
      { status: 502 },
    )
  }
  return NextResponse.json({ status: 'sent', email: result.email })
}
