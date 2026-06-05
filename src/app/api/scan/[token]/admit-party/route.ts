import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@payloadcms/db-postgres'
import { admitParty } from '@/lib/scan-token'
import { isAuthed } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import { scanRedirectUrl } from '@/lib/site-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "Admit entire party" — staff-only. Marks every still-active, not-yet-scanned
// ticket of the scanned token's order as scanned in one tap. Race-safe: the
// UPDATE's `scanned = false` filter means N parallel taps each admit a person
// at most once. Redirects back to the scan screen with the count admitted.
//
// By design this does NOT re-validate the triggering token's own state (it
// resolves the order from any existing token and admits that order's active
// siblings). The UI only surfaces the button on a VALID scan, but safety does
// not depend on that gate: the endpoint is staff-only, the per-ticket
// `status='active'` filter excludes cancelled tickets, and there's no buyer
// path to it. Party-admit is an explicit staff judgment call (ADR-0007).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const gate = await requireRole(req, isAuthed)
  if (gate.error) return gate.error
  const { payload } = gate

  const { token } = await params
  const drizzle: any = (payload.db as any).drizzle

  // The scan page POSTs a form and wants a 303 back to itself; the tehnika
  // lookup panel fetches with Accept: application/json and wants the count.
  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json')

  // Resolve the order from the scanned token.
  const orderRes: any = await drizzle.execute(sql`
    SELECT order_id FROM tickets WHERE token = ${token} LIMIT 1
  `)
  const orderRow = (orderRes.rows ?? orderRes)[0]
  if (!orderRow) {
    if (wantsJson) {
      return NextResponse.json({ error: 'Unknown token' }, { status: 404 })
    }
    // Unknown token — bounce back to the scan screen, which renders INVALID.
    return NextResponse.redirect(scanRedirectUrl(token), { status: 303 })
  }
  const orderId = String(orderRow.order_id)

  const { admitted } = await admitParty(orderId, {
    atomicAdmitParty: async (oid) => {
      const res: any = await drizzle.execute(sql`
        UPDATE tickets
        SET scanned = true,
            scanned_at = NOW(),
            updated_at = NOW()
        WHERE order_id = ${Number(oid)}
          AND status = 'active'
          AND scanned = false
        RETURNING id
      `)
      return (res.rows ?? res).length
    },
  })

  if (wantsJson) {
    return NextResponse.json({ admitted })
  }

  return NextResponse.redirect(scanRedirectUrl(token, { party: String(admitted) }), { status: 303 })
}
