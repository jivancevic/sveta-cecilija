import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '@payload-config'
import { undoScan } from '@/lib/scan-token'
import { isAuthed } from '@/lib/access/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAuthed(user as { role?: string })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { token } = await params
  // Drizzle is exposed on the postgres adapter; not in Payload's public types.
  const drizzle: any = (payload.db as any).drizzle

  const result = await undoScan(token, {
    atomicUndo: async (tok, windowMs) => {
      const seconds = Math.floor(windowMs / 1000)
      // Server-enforced window: SQL itself rejects rows whose scanned_at is
      // outside the window, so a stale client click cannot succeed.
      const res: any = await drizzle.execute(sql`
        UPDATE qr_tokens
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

  if (result.status === 'UNDONE') {
    const url = new URL(`/scan/${token}`, req.url)
    return NextResponse.redirect(url, { status: 303 })
  }

  const url = new URL(`/scan/${token}`, req.url)
  url.searchParams.set('undo', 'rejected')
  return NextResponse.redirect(url, { status: 303 })
}

