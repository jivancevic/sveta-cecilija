// Where a performance happens, in one sentence (#433, #436).
//
// A public row has a venue and no location, a private booking a free-text
// location and no venue (ADR-0024, enforced in `show-performance.ts`). Every
// surface that has to print "where" — a change notification, a calendar entry,
// the `/app` header — asks this function rather than re-deciding which of the
// two fields is populated, so a booking moved from the pier to the cloister
// reads the same everywhere.
//
// Croatian only, like everything the roster shows: `VENUE_LABEL.hr` is the same
// map the buyer-facing surfaces use in their own locale.

import { VENUE_LABEL, type Venue } from '@/lib/venues'

export interface PlacedPerformance {
  isPublic: boolean
  venue: Venue | null
  location: string | null
}

/** The venue's Croatian label, the free-text location, or an empty string. */
export function performancePlace(performance: PlacedPerformance): string {
  if (performance.isPublic) {
    return performance.venue ? VENUE_LABEL.hr[performance.venue] : ''
  }
  return performance.location ?? ''
}
