// Read side of the critical-events sink (ADR-0015): the last N events for the
// superadmin dev strip on /admin. Pure + DI (PoolQuery) like the writer.
import type { PoolQuery } from '../tickets/sold-seats'

export interface CriticalEventRow {
  id: number
  kind: string
  context: Record<string, unknown> | null
  /** ISO 8601 UTC. */
  createdAt: string
}

export async function listRecentCriticalEvents(
  query: PoolQuery,
  limit = 20,
): Promise<CriticalEventRow[]> {
  const { rows } = await query(
    `SELECT id, kind, context, created_at
       FROM critical_events
   ORDER BY created_at DESC, id DESC
      LIMIT $1`,
    [limit],
  )
  return rows.map((r) => ({
    id: Number(r.id),
    kind: String(r.kind),
    context: (r.context as Record<string, unknown> | null) ?? null,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }))
}
