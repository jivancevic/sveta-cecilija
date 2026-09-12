// The Payload-backed `ShowsRepo` (#475, #501, #503).
//
// `detailsById` is one id-addressed read, order-joined by every caller: the id
// arrives off a ticket's order, so a non-public performance — which sells
// nothing and so owns no ticket — cannot surface. `ticketedPerformances` is the
// other direction: every row that DOES sell tickets, for Narudžbe's filter
// (#501), through the `show-performance.ts` predicate rather than a hand-spelled
// `isPublic`. Neither is the schedule: that is read through `src/lib/shows.ts`.
//
// The three voditelj methods (#503) are the writes behind Dodaj / Uredi /
// Otkaži / Pragovi. Both writers go through the LOCAL API on purpose:
//
//   - `createPerformances` is `createPerformancesInBulk`, the same writer
//     `/api/shows/bulk-create` and the MCP `create_performances` tool use, so
//     the transaction and the one-announcement rule are stated once.
//   - `updatePerformance` is `payload.update`, so the Shows `afterChange` hook
//     fires and the roster learns that a ship call moved or was cancelled. A
//     raw `UPDATE` would make a change from the phone silent while the same
//     change from the Backoffice rang everybody.
//
// `overrideAccess: true` (the local API's default) means FIELD access does not
// run: "a voditelj may not touch a public row" is refused in the route, not
// here. `user` is still carried so the hooks see who is asking.

import { toIsoDate } from '@/lib/to-iso-date'
import { PUBLIC_PERFORMANCE_WHERE } from '@/lib/show-performance'
import {
  createPerformancesInBulk,
  payloadBulkDeps,
  type BulkCreatePayload,
} from '@/lib/performance-bulk-create'
import type { PerformanceRow, ShowsRepo, TicketedPerformance } from '../shows'
import { payloadClient, type PayloadClient } from './client'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function count(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** A Shows document → the row the voditelj's forms read. */
export function toPerformanceRow(doc: Record<string, unknown>): PerformanceRow {
  const isPublic = doc.isPublic !== false
  return {
    id: String(doc.id),
    // `toIsoDate`, never `String(...).slice(0, 10)`: a `dayOnly` column comes
    // back as a Date from the adapter, whose `String()` is "Mon Jun 22 2026 …".
    date: toIsoDate(doc.date),
    time: typeof doc.time === 'string' ? doc.time : '',
    kind: typeof doc.kind === 'string' ? doc.kind : 'redovna',
    isPublic,
    cancelled: doc.status === 'cancelled',
    location: isPublic ? null : text(doc.location),
    client: isPublic ? null : text(doc.client),
    thresholdCrni: count(doc.thresholdCrni, 8),
    thresholdBili: count(doc.thresholdBili, 8),
  }
}

export function createShowsRepo(load: () => Promise<PayloadClient> = payloadClient): ShowsRepo {
  return {
    async detailsById(id) {
      const payload = await load()
      try {
        const doc = await payload.findByID({ collection: 'shows', id, depth: 0 })
        return {
          // A `dayOnly` column comes back as a Date from the adapter; the whole
          // app passes the day around as `YYYY-MM-DD`.
          date: new Date(doc.date as string).toISOString().slice(0, 10),
          time: doc.time as string,
          venue: doc.venue as string,
        }
      } catch {
        return null
      }
    },

    async ticketedPerformances(): Promise<TicketedPerformance[]> {
      const payload = await load()
      const found = await payload.find({
        collection: 'shows',
        where: PUBLIC_PERFORMANCE_WHERE,
        sort: '-date',
        depth: 0,
        // The whole ticketed history: a season is 22 evenings, so this is a
        // short list and a filter that could not reach last August would be
        // useless the week after a season ends.
        limit: 500,
        overrideAccess: true,
      })
      return found.docs.map((doc) => ({
        id: String(doc.id),
        // `toIsoDate`, never `String(...).slice(0, 10)`: a `dayOnly` column
        // comes back as a Date, whose `String()` is "Mon Jun 22 2026 …".
        date: toIsoDate(doc.date),
        time: typeof doc.time === 'string' ? doc.time : '',
        venue: typeof doc.venue === 'string' ? doc.venue : '',
      }))
    },

    async performanceById(id) {
      const payload = await load()
      try {
        const doc = await payload.findByID({
          collection: 'shows',
          id,
          depth: 0,
          overrideAccess: true,
        })
        return doc ? toPerformanceRow(doc as unknown as Record<string, unknown>) : null
      } catch {
        // A bad id in a URL is a refusal from the handler, never a 500 here.
        return null
      }
    },

    createPerformances(rows, actor) {
      return load().then((payload) =>
        createPerformancesInBulk(rows, payloadBulkDeps(payload as unknown as BulkCreatePayload, actor)),
      )
    },

    async updatePerformance(id, patch, actor) {
      const payload = await load()
      await payload.update({
        collection: 'shows',
        id,
        // Widened the way `/api/app/note` widens its own update, and for the
        // same reason: `data` is typed from the generated `payload-types.ts`,
        // which this repo deliberately does not commit, so at typecheck time it
        // is not the Shows shape. `PerformancePatch` is the real contract.
        data: patch as Parameters<typeof payload.update>[0]['data'],
        overrideAccess: true,
        user: actor as Parameters<typeof payload.update>[0]['user'],
      })
    },
  }
}
