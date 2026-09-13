// The Payload-backed `StatsRepo` (#508, #475).
//
// Wiring, never arithmetic: every one of the five methods delegates to a loader
// that already existed and is already tested — the grouped ticket query, the
// ledger totals, the scanned counts, and Payload's own find for the two shows
// reads. There is no SQL in this file at all.
//
// The two shows reads go through the LOCAL API rather than raw SQL, so the
// public-performance predicate is the shared `PUBLIC_PERFORMANCE_WHERE` and not
// a second spelling of it (ADR-0024; `show-performance-guard.test.ts` enforces
// exactly this). `overrideAccess: true` is Payload's default for the local API,
// so collection access scopes none of it — the caller has already been gated by
// `openScreen('stats')`.

import { toIsoDate } from '@/lib/to-iso-date'
import { PUBLIC_PERFORMANCE_WHERE } from '@/lib/show-performance'
import type { SeasonShowFacts } from '@/lib/app/stats-screen'
import {
  getSeasonOfflineTypesByShow,
  getSeasonTicketRowsByShow,
} from '@/lib/member/season-data'
import type { SeasonOfflineTypes, SeasonTicketRow } from '@/lib/member/season'
import { getScannedTicketCountsByShow } from '@/lib/tickets/sold-seats'
import type { Venue } from '@/lib/venues'
import type { StatsRepo } from '../stats'
import { payloadClient, poolOf, type PayloadClient } from './client'

/** The half-open instant range of one calendar year, as Payload reads dates. */
function seasonBounds(season: number): { from: string; to: string } {
  return {
    from: `${season}-01-01T00:00:00.000Z`,
    to: `${season + 1}-01-01T00:00:00.000Z`,
  }
}

export function createStatsRepo(load: () => Promise<PayloadClient> = payloadClient): StatsRepo {
  return {
    async publicPerformances(season): Promise<SeasonShowFacts[]> {
      const payload = await load()
      const { from, to } = seasonBounds(season)
      const found = await payload.find({
        collection: 'shows',
        where: {
          and: [
            PUBLIC_PERFORMANCE_WHERE,
            { date: { greater_than_equal: from } },
            { date: { less_than: to } },
          ],
        },
        sort: 'date',
        depth: 0,
        // A season is twenty-odd evenings; the limit is a guard, not a page.
        limit: 1000,
        overrideAccess: true,
      })
      return found.docs.map((doc) => ({
        id: String(doc.id),
        // `toIsoDate`, never `String(...).slice(0, 10)`: the column comes back
        // from node-postgres as a Date, whose `String()` is "Sun Jul 12 2026 …".
        date: toIsoDate(doc.date),
        time: typeof doc.time === 'string' ? doc.time : '',
        // The save validation guarantees a public row has a venue; a row that
        // somehow has none is read as Ljetno rather than dropped, because a
        // missing performance would silently shrink the season.
        venue: (typeof doc.venue === 'string' ? doc.venue : 'ljetno-kino') as Venue,
        cancelled: doc.status === 'cancelled',
      }))
    },

    async ticketsByShow(): Promise<Map<string, SeasonTicketRow>> {
      const payload = await load()
      const rows = await getSeasonTicketRowsByShow(poolOf(payload))
      return new Map(rows.map((row) => [row.showId, row]))
    },

    async offlineByShow(): Promise<Map<string, SeasonOfflineTypes>> {
      const payload = await load()
      return getSeasonOfflineTypesByShow(poolOf(payload))
    },

    async scannedByShow(): Promise<Map<string, number>> {
      const payload = await load()
      return getScannedTicketCountsByShow(poolOf(payload))
    },

    async firstSeason(): Promise<number | null> {
      const payload = await load()
      const found = await payload.find({
        collection: 'shows',
        where: PUBLIC_PERFORMANCE_WHERE,
        sort: 'date',
        // One row, not a count: the picker's lower bound is a range, not a set.
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const first = found.docs[0]
      if (!first) return null
      const year = Number(toIsoDate(first.date).slice(0, 4))
      return Number.isInteger(year) && year > 1900 ? year : null
    },
  }
}
