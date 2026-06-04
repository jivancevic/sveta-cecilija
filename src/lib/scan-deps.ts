import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '@payload-config'
import type { ScanDeps } from '@/lib/scan-token'

/**
 * Builds the live (Payload + drizzle) implementation of `ScanDeps` shared by the
 * scan API route (`/api/scan/[token]`) and the scan page (`/scan/[token]`).
 * Both surfaces resolve a token through the same `scanToken()` logic, so they
 * must wire identical queries — keeping one builder here stops the two from
 * drifting (e.g. the "still-admittable" predicate `status='active' AND
 * scanned=false` used by both the count below and the admit-party UPDATE).
 */
export async function buildScanDeps(): Promise<ScanDeps> {
  const payload = await getPayload({ config })
  // Drizzle instance is exposed on the postgres adapter as `db.drizzle`.
  // Typed as `any` because Payload does not export the adapter's internal types.
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
