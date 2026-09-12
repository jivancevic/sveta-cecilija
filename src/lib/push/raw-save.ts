// Notifying the roster about a write that never touched the collection (#441
// review of #436).
//
// Two admin actions move a performance with raw SQL and no Payload write at
// all: the #379 reschedule (`claimReschedule`) and the #94 venue move
// (`claimMove`). Both are optimistic-concurrency `UPDATE … WHERE … RETURNING`
// claims, which is exactly why they cannot go through the collection — and
// which means the `afterChange` hook never fires for them.
//
// Those are also the two most consequential changes a performance can undergo:
// a moved date and a moved venue are precisely what a dancer must not learn on
// the pier. And a moved date is what leaves the alarm/reminder claims pointing
// at an evening that no longer exists — the #440 defect this all exists to fix.
//
// So each route reads the row before its claim and after it, and hands both
// here. `notifyPerformanceFactsSaved` then makes the same decision it makes for
// a collection save: nothing is duplicated, and a route that forgets to call
// this is a missing notification rather than a wrong one.
//
// Nothing here may fail the request. The reschedule has already moved the date
// and mailed the buyers by the time it is called.

import { toIsoDate } from '@/lib/to-iso-date'
import type { PerformanceFacts } from '@/lib/app/performance-facts'
import type { PerformanceKind } from '@/lib/show-performance'
import type { Venue } from '@/lib/venues'
import { notifyPerformanceFactsSaved, type NotifyDeps } from './notify'
import type { PushQuery } from './store'

/** Everything the diff and the messages read, straight off the table. */
const FACTS_SQL = `SELECT id, date, time, kind, is_public, venue, location, status, voditelj_note, updated_at
                     FROM shows WHERE id = $1`

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * A raw pg row → the facts.
 *
 * `toIsoDate` rather than a slice, because pg hands `shows.date` back as a JS
 * Date whose `String()` is "Mon Jun 22 2026 …" — sliced, that would read as a
 * changed date on every single save.
 *
 * The public/private shape mirrors `toRosterPerformance`: a public row has a
 * venue and no location, a booking the reverse, so the two sources agree about
 * what "place" means.
 */
export function rowToPerformanceFacts(row: Record<string, unknown>): PerformanceFacts {
  const isPublic = row.is_public !== false
  return {
    id: String(row.id),
    date: toIsoDate(row.date),
    time: typeof row.time === 'string' ? row.time : '',
    kind: ((row.kind as PerformanceKind) ?? 'redovna') as PerformanceKind,
    isPublic,
    venue: isPublic ? ((row.venue as Venue) ?? null) : null,
    location: isPublic ? null : text(row.location),
    cancelled: row.status === 'cancelled',
    voditeljNote: text(row.voditelj_note),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : typeof row.updated_at === 'string'
          ? row.updated_at
          : null,
  }
}

/** The row as it stands, or null when there is none (or the read failed). */
export async function loadPerformanceFacts(
  query: PushQuery,
  id: string | number,
): Promise<PerformanceFacts | null> {
  try {
    const res = await query(FACTS_SQL, [Number(id)])
    const row = res.rows[0]
    return row ? rowToPerformanceFacts(row) : null
  } catch (err) {
    console.error('[push] could not read the performance for a notification', err)
    return null
  }
}

/**
 * Read the row after a raw write and notify about the difference.
 *
 * `previous` is what the caller read BEFORE its update. A null previous would
 * mean "created", which no raw route ever does, so a null one here is treated
 * as "we could not tell what changed" and nothing is sent.
 */
export async function notifyRawPerformanceSave(
  id: string | number,
  previous: PerformanceFacts | null,
  deps: NotifyDeps & { query: PushQuery },
): Promise<void> {
  try {
    if (!previous) return
    const next = await loadPerformanceFacts(deps.query, id)
    if (!next) return
    await notifyPerformanceFactsSaved({ previous, next }, deps)
  } catch (err) {
    // The date has already moved and the buyers have already been mailed.
    console.error('[push] raw save notification failed', err)
  }
}
