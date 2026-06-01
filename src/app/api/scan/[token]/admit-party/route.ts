import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '@payload-config'
import { admitParty } from '@/lib/scan-token'
import { isAuthed } from '@/lib/access/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "Admit entire party" — staff-only. Marks every still-active, not-yet-scanned
// ticket of the scanned token's order as scanned in one tap. Race-safe: the
// UPDATE's `scanned = false` filter means N parallel taps each admit a person
// at most once. Redirects back to the scan screen with the count admitted.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAuthed(user as { role?: string })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { token } = await params
  const drizzle: any = (payload.db as any).drizzle

  // Resolve the order from the scanned token.
  const orderRes: any = await drizzle.execute(sql`
    SELECT order_id FROM tickets WHERE token = ${token} LIMIT 1
  `)
  const orderRow = (orderRes.rows ?? orderRes)[0]
  if (!orderRow) {
    // Unknown token — bounce back to the scan screen, which renders INVALID.
    return NextResponse.redirect(new URL(`/scan/${encodeURIComponent(token)}`, req.url), {
      status: 303,
    })
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

  const url = new URL(`/scan/${encodeURIComponent(token)}`, req.url)
  url.searchParams.set('party', String(admitted))
  return NextResponse.redirect(url, { status: 303 })
}
