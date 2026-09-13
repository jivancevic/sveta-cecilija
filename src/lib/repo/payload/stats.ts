// The Payload-backed `StatsRepo` (#508, #475).
//
// Wiring, never arithmetic. Four of the six methods delegate to a loader that
// already existed and is already tested — the grouped ticket query, the ledger
// totals, the scanned counts — and the two that carry SQL of their own are the
// comps-per-member report with a season on it and nothing else.
//
// The two shows reads go through the LOCAL API rather than raw SQL, so the
// public-performance predicate is the shared `PUBLIC_PERFORMANCE_WHERE` and not
// a second spelling of it (ADR-0024; `show-performance-guard.test.ts` enforces
// exactly this). `overrideAccess: true` is Payload's default for the local API,
// so collection access scopes none of it — the caller has already been gated by
// `openScreen('stats')`.

import { toIsoDate } from '@/lib/to-iso-date'
import { PUBLIC_PERFORMANCE_WHERE, publicPerformanceSql } from '@/lib/show-performance'
import type { CompMemberSeasonRow, SeasonShowFacts } from '@/lib/app/stats-screen'
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

    async compsByMemberForSeason(season): Promise<CompMemberSeasonRow[]> {
      const payload = await load()
      const { from, to } = seasonBounds(season)
      // `getCompCountsByMember` (tickets/sold-seats.ts) with the evening's date
      // added to its WHERE. The inner group-by-order is what keeps the count
      // honest: counting tickets straight off a join to orders would multiply a
      // party by the number of rows it fans out to.
      const res = await poolOf(payload)(
        `SELECT
           oc.member_id AS member_id,
           m.name AS member_name,
           SUM(oc.adult_tickets)::int AS adult_tickets,
           SUM(oc.child_tickets)::int AS child_tickets,
           SUM(oc.total_tickets)::int AS total_tickets
         FROM (
           SELECT o.id AS order_id,
                  o.member_id AS member_id,
                  COUNT(t.id) FILTER (WHERE t.status = 'active' AND t.type = 'adult') AS adult_tickets,
                  COUNT(t.id) FILTER (WHERE t.status = 'active' AND t.type = 'child') AS child_tickets,
                  COUNT(t.id) FILTER (WHERE t.status = 'active') AS total_tickets
           FROM orders o
           JOIN shows s ON s.id = o.show_id
           LEFT JOIN tickets t ON t.order_id = o.id
           WHERE o.channel = 'comp'
             AND o.member_id IS NOT NULL
             AND ${publicPerformanceSql('s')}
             AND s.date >= $1 AND s.date < $2
           GROUP BY o.id
         ) oc
         LEFT JOIN members m ON m.id = oc.member_id
         GROUP BY oc.member_id, m.name`,
        [from, to],
      )
      return res.rows
        .map((row) => ({
          memberId: String(row.member_id),
          memberName: row.member_name == null ? '' : String(row.member_name),
          adult: Number(row.adult_tickets) || 0,
          child: Number(row.child_tickets) || 0,
          total: Number(row.total_tickets) || 0,
        }))
        .sort((a, b) => b.total - a.total || a.memberName.localeCompare(b.memberName))
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
