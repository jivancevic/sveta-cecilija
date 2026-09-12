import { sql } from '@payloadcms/db-postgres'
import { getRepo } from '@/lib/repo'
import type { DbRepo } from '@/lib/repo/db'
import type { OrdersRepo } from '@/lib/repo/orders'
import type { ShowsRepo } from '@/lib/repo/shows'
import type { ScanDeps } from '@/lib/scan-token'

/**
 * Builds the live implementation of `ScanDeps` shared by the scan API route
 * (`/api/scan/[token]`), the public scan page (`/scan/[token]`) and the Skener
 * screen's routes. All of them resolve a token through the same `scanToken()`
 * logic, so they must wire identical queries — keeping one builder here stops
 * the two from drifting (e.g. the "still-admittable" predicate `status='active'
 * AND scanned=false` used by both the count below and the admit-party UPDATE).
 *
 * Since #504 the connection arrives through the repository seam (`getRepo()`,
 * #475) instead of `getPayload()`. **The SQL did not move**: this module still
 * owns the atomic mark-and-read, which is the seam's own rule — the statements
 * that carry the race-safety stay verbatim where they are and take
 * `DbRepo.execute` rather than reaching into `payload.db.drizzle` themselves.
 */
export interface ScanDepsRepo {
  db: Pick<DbRepo, 'execute'>
  orders: Pick<OrdersRepo, 'detailsById'>
  shows: Pick<ShowsRepo, 'detailsById'>
}

function firstRow(res: { rows?: unknown[] } | unknown[]): Record<string, unknown> | undefined {
  const rows = (Array.isArray(res) ? res : (res.rows ?? [])) as Record<string, unknown>[]
  return rows[0]
}

/** A timestamp column, as an ISO string; '' when the column is NULL. */
function isoOrEmpty(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return value ? String(value) : ''
}

export function buildScanDepsFor(repo: ScanDepsRepo): ScanDeps {
  const { execute } = repo.db

  return {
    atomicMarkScanned: async (token) => {
      const row = firstRow(
        await execute(sql`
          UPDATE tickets
          SET scanned = true,
              scanned_at = NOW(),
              updated_at = NOW()
          WHERE token = ${token} AND scanned = false AND status = 'active'
          RETURNING order_id, scanned_at
        `),
      )
      if (!row) return null
      return { orderId: String(row.order_id), scannedAt: isoOrEmpty(row.scanned_at) }
    },
    findScannedToken: async (token) => {
      const row = firstRow(
        await execute(sql`
          SELECT order_id, scanned_at
          FROM tickets
          WHERE token = ${token}
          LIMIT 1
        `),
      )
      if (!row) return null
      return { orderId: String(row.order_id), scannedAt: isoOrEmpty(row.scanned_at) }
    },
    findTicket: async (token) => {
      const row = firstRow(
        await execute(sql`
          SELECT order_id, scanned, scanned_at, status, cancel_reason
          FROM tickets
          WHERE token = ${token}
          LIMIT 1
        `),
      )
      if (!row) return null
      return {
        orderId: String(row.order_id),
        scanned: Boolean(row.scanned),
        scannedAt: isoOrEmpty(row.scanned_at),
        status: row.status === 'cancelled' ? 'cancelled' : 'active',
        cancelReason:
          row.cancel_reason === 'storno' || row.cancel_reason === 'refund'
            ? row.cancel_reason
            : null,
      }
    },
    findOrderDetails: (orderId) => repo.orders.detailsById(orderId),
    findShowDetails: (showId) => repo.shows.detailsById(showId),
    countUnscannedActiveTickets: async (orderId) => {
      const row = firstRow(
        await execute(sql`
          SELECT COUNT(*)::int AS n
          FROM tickets
          WHERE order_id = ${Number(orderId)} AND status = 'active' AND scanned = false
        `),
      )
      return Number(row?.n ?? 0)
    },
  }
}

export async function buildScanDeps(): Promise<ScanDeps> {
  return buildScanDepsFor(getRepo())
}
