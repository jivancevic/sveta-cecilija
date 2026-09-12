import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@payloadcms/db-postgres'
import { undoScan } from '@/lib/scan-token'
import { requirePermission } from '@/lib/access/route-guard'
import { scanRedirectUrl } from '@/lib/site-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Undo an admission, inside the two-minute window.
//
// **Two callers, two answers, and the difference is not cosmetic** (#504
// review). The public `/scan/[token]` page POSTs a form and wants a 303 back to
// itself. A `fetch` from Skener must NOT get that: `fetch` follows redirects by
// default, the redirect lands on `/scan/[token]`, and a staff GET of that page
// runs `scanToken(…, { viewer: 'staff' })` — which marks the ticket scanned
// again. Undo would silently undo itself. So a caller that says
// `Accept: application/json` gets the status as JSON and no redirect, the way
// `admit-party` already does.
//
// The status is in the BODY, never in the HTTP code: both outcomes are a
// well-formed answer to a well-formed request, and a client that branched on
// `res.ok` would report "undone" for a rejection (which is exactly the bug this
// replaces).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const gate = await requirePermission(req, ['door', 'tickets'])
  if (gate.error) return gate.error
  const { payload } = gate

  const { token } = await params
  // Drizzle is exposed on the postgres adapter; not in Payload's public types.
  const drizzle: any = (payload.db as any).drizzle

  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json')

  const result = await undoScan(token, {
    atomicUndo: async (tok, windowMs) => {
      const seconds = Math.floor(windowMs / 1000)
      // Server-enforced window: SQL itself rejects rows whose scanned_at is
      // outside the window, so a stale client click cannot succeed.
      const res: any = await drizzle.execute(sql`
        UPDATE tickets
        SET scanned = false,
            scanned_at = NULL,
            updated_at = NOW()
        WHERE token = ${tok}
          AND scanned = true
          AND scanned_at > NOW() - (${seconds} || ' seconds')::interval
        RETURNING token
      `)
      const row = (res.rows ?? res)[0]
      return !!row
    },
  })

  if (wantsJson) {
    return NextResponse.json({ status: result.status })
  }

  if (result.status === 'UNDONE') {
    return NextResponse.redirect(scanRedirectUrl(token), { status: 303 })
  }

  return NextResponse.redirect(scanRedirectUrl(token, { undo: 'rejected' }), { status: 303 })
}
