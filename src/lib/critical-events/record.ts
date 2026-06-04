// Curated critical-events sink (ADR-0016). The app writes one row here at known
// failure seams that would otherwise be silent — e.g. an enquiry-notification
// email that never delivers. This is NOT log aggregation: raw stdout/container
// logs are out of scope; this table holds a small set of deliberately-recorded
// events a superadmin can glance at on /admin.
//
// Pure + DI (takes a PoolQuery) so it's unit-testable without Payload, and
// BEST-EFFORT by construction: a failure to record must never cascade into
// failing the operation that was trying to report a problem. Every writer can
// therefore call it unguarded.
import type { PoolQuery } from '../tickets/sold-seats'

export interface CriticalEvent {
  kind: string
  context?: Record<string, unknown>
}

export interface RecordCriticalEventDeps {
  query: PoolQuery
}

export async function recordCriticalEvent(
  event: CriticalEvent,
  deps: RecordCriticalEventDeps,
): Promise<void> {
  try {
    await deps.query(
      `INSERT INTO critical_events (kind, context) VALUES ($1, $2::jsonb)`,
      [event.kind, event.context ? JSON.stringify(event.context) : null],
    )
  } catch (err) {
    // Swallow: the whole point of this sink is to surface problems, so it must
    // never become a new failure mode itself.
    console.error('[recordCriticalEvent] failed to persist event', event.kind, err)
  }
}
