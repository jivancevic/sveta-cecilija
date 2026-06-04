import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '@payload-config'
import { scanToken, canUndoScan, type ScanDeps } from '@/lib/scan-token'
import { isAuthed } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function buildDeps(): Promise<ScanDeps> {
  const payload = await getPayload({ config })
  const drizzle: any = (payload.db as any).drizzle
  return {
    atomicMarkScanned: async (token) => {
      const res: any = await drizzle.execute(sql`
        UPDATE tickets
        SET scanned = true,
            scanned_at = NOW(),
            updated_at = NOW()
        WHERE token = ${token} AND scanned = false AND status = 'active'
        RETURNING order_id, scanned_at
      `)
      const row = (res.rows ?? res)[0]
      if (!row) return null
      const scannedAt =
        row.scanned_at instanceof Date ? row.scanned_at.toISOString() : String(row.scanned_at)
      return { orderId: String(row.order_id), scannedAt }
    },
    findScannedToken: async (token) => {
      const res: any = await drizzle.execute(sql`
        SELECT order_id, scanned_at
        FROM tickets
        WHERE token = ${token}
        LIMIT 1
      `)
      const row = (res.rows ?? res)[0]
      if (!row) return null
      const scannedAt =
        row.scanned_at instanceof Date
          ? row.scanned_at.toISOString()
          : row.scanned_at
            ? String(row.scanned_at)
            : ''
      return { orderId: String(row.order_id), scannedAt }
    },
    findTicket: async (token) => {
      const res: any = await drizzle.execute(sql`
        SELECT order_id, scanned, scanned_at, status, cancel_reason
        FROM tickets
        WHERE token = ${token}
        LIMIT 1
      `)
      const row = (res.rows ?? res)[0]
      if (!row) return null
      const scannedAt =
        row.scanned_at instanceof Date
          ? row.scanned_at.toISOString()
          : row.scanned_at
            ? String(row.scanned_at)
            : ''
      return {
        orderId: String(row.order_id),
        scanned: Boolean(row.scanned),
        scannedAt,
        status: row.status === 'cancelled' ? 'cancelled' : 'active',
        cancelReason:
          row.cancel_reason === 'storno' || row.cancel_reason === 'refund'
            ? row.cancel_reason
            : null,
      }
    },
    findOrderDetails: async (orderId) => {
      try {
        const doc = await payload.findByID({ collection: 'orders', id: orderId, depth: 0 })
        return {
          buyerName: (doc.buyerName as string) ?? '',
          adultCount: (doc.adultCount as number) ?? 0,
          childCount: (doc.childCount as number) ?? 0,
          showId: String(doc.show),
          email: (doc.email as string | null) ?? null,
          code: (doc.code as string | null) ?? null,
        }
      } catch {
        return null
      }
    },
    findShowDetails: async (showId) => {
      try {
        const doc = await payload.findByID({ collection: 'shows', id: showId, depth: 0 })
        return {
          date: new Date(doc.date as string).toISOString().slice(0, 10),
          time: doc.time as string,
          venue: doc.venue as string,
        }
      } catch {
        return null
      }
    },
    countUnscannedActiveTickets: async (orderId) => {
      const res: any = await drizzle.execute(sql`
        SELECT COUNT(*)::int AS n
        FROM tickets
        WHERE order_id = ${Number(orderId)} AND status = 'active' AND scanned = false
      `)
      const row = (res.rows ?? res)[0]
      return Number(row?.n ?? 0)
    },
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const gate = await requireRole(req, isAuthed)
  if (gate.error) return gate.error

  const { token } = await params
  const deps = await buildDeps()
  const result = await scanToken(token, deps, { viewer: 'staff' })
  const undoEligible =
    result.status === 'ALREADY_SCANNED' ? canUndoScan(result.scannedAt) : false
  return NextResponse.json({ token, result, undoEligible })
}
