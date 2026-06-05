import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@payloadcms/db-postgres'
import { undoScan } from '@/lib/scan-token'
import { isAuthed } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import { scanRedirectUrl } from '@/lib/site-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const gate = await requireRole(req, isAuthed)
  if (gate.error) return gate.error
  const { payload } = gate

  const { token } = await params
  // Drizzle is exposed on the postgres adapter; not in Payload's public types.
  const drizzle: any = (payload.db as any).drizzle

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

  if (result.status === 'UNDONE') {
    return NextResponse.redirect(scanRedirectUrl(token), { status: 303 })
  }

  return NextResponse.redirect(scanRedirectUrl(token, { undo: 'rejected' }), { status: 303 })
}

