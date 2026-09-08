// The facts about a performance that leave the app (#436, #433).
//
// One projection, two consumers: the change notification's diff and the ICS
// feed's events. They watch the same fields for the same reason — a dancer has
// to know WHEN, WHERE and WHAT ABOUT IT CHANGED — so projecting them twice
// would mean two places for "which field holds the place" to drift.
//
// Built on `toRosterPerformance`, the projection `/app`'s cards already use, so
// a public row carries a venue and no location and a private booking the
// reverse. `updatedAt` is the one field only the feed reads (it drives
// SEQUENCE); it costs nothing to carry and it keeps the type single.

import { toRosterPerformance } from './roster-loaders'
import type { PerformanceKind } from '@/lib/show-performance'
import type { Venue } from '@/lib/venues'

export interface PerformanceFacts {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, Europe/Zagreb wall clock. */
  time: string
  kind: PerformanceKind
  isPublic: boolean
  /** Public rows only. */
  venue: Venue | null
  /** Non-public rows: the free-text place. */
  location: string | null
  cancelled: boolean
  voditeljNote: string | null
  /** The row's `updatedAt`, ISO. Null when the caller did not read it. */
  updatedAt: string | null
}

/** A Payload Shows doc → the facts. */
export function toPerformanceFacts(doc: Record<string, unknown>): PerformanceFacts {
  const p = toRosterPerformance(doc)
  return {
    id: p.id,
    date: p.date,
    time: p.time,
    kind: p.kind,
    isPublic: p.isPublic,
    venue: p.venue,
    location: p.location,
    cancelled: p.cancelled,
    voditeljNote: p.voditeljNote,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
  }
}
