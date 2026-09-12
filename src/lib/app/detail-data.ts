import { getPayload } from 'payload'
import config from '@payload-config'
import { relationIdString } from '@/lib/payload-relation'
import { loadSeatsRemaining, type CompPayload } from './comp-data'
import { loadPerformanceDetail, type PerformanceDetail } from './detail-loaders'

// The IO wiring behind `/app/performances/[id]` (#423) — the `roster-data.ts` shape:
// the Payload calls and nothing else, so every rule about what the detail shows
// stays in the pure, unit-tested `detail-loaders.ts`.
//
// The local API runs with `overrideAccess: true`, so collection access scopes
// none of these reads. That is deliberate and the same decision the season list
// made: roster visibility is society-wide, and the caller has already
// established through the `/app` access decision that the viewer is on the
// roster. The moreškant roster covers EVERY performance of the season, public or
// not (ADR-0024), so the shows read carries no public predicate — the phase 2
// guard test lists this file with that justification.

export async function getPerformanceDetail(
  performanceId: string,
  viewer: { memberId: string | null; voditelj: boolean },
): Promise<PerformanceDetail | null> {
  const payload = await getPayload({ config })

  return loadPerformanceDetail(performanceId, {
    viewer,

    loadPerformance: async (id) => {
      try {
        return (await payload.findByID({
          collection: 'shows',
          id,
          depth: 0,
          overrideAccess: true,
        })) as unknown as Record<string, unknown>
      } catch {
        // A bad id in the URL is a missing page, not a 500.
        return null
      }
    },

    loadAttendance: async (id) => {
      const result = await payload.find({
        collection: 'attendance',
        where: { performance: { equals: id } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      return result.docs as unknown as Record<string, unknown>[]
    },

    // The postava (#432). Loaded for every viewer; whether it is SHOWN is the
    // loader's decision (`visible`), so the confirmation rule lives in one
    // place rather than in a query condition here as well.
    loadLineup: async (id) => {
      const result = await payload.find({
        collection: 'lineups',
        where: { performance: { equals: id } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      return result.docs as unknown as Record<string, unknown>[]
    },

    // The viewer's OWN self-issued comps (#434). Two queries and never a third:
    // the orders this dancer issued here, then the tickets under them in one
    // `in` read, folded per order. `compIssuedBy: 'self'` is what keeps an
    // admin's comp for the same member out of the list AND out of the cap
    // (#430, story 52); a NULL from before the column never equals 'self'.
    loadOwnComps: async (id, memberId) => {
      const orders = await payload.find({
        collection: 'orders',
        where: {
          and: [
            { show: { equals: id } },
            { member: { equals: memberId } },
            { channel: { equals: 'comp' } },
            { compIssuedBy: { equals: 'self' } },
          ],
        },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      const docs = orders.docs as unknown as Record<string, unknown>[]
      if (docs.length === 0) return []

      const tickets = await payload.find({
        collection: 'tickets',
        where: { order: { in: docs.map((o) => String(o.id)) } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })

      const active = new Map<string, number>()
      const scanned = new Set<string>()
      for (const row of tickets.docs as unknown as Record<string, unknown>[]) {
        const orderId = relationIdString(row.order)
        if (!orderId) continue
        if (row.status === 'active') active.set(orderId, (active.get(orderId) ?? 0) + 1)
        if (row.scanned === true) scanned.add(orderId)
      }

      return docs.map((o) => ({
        orderId: String(o.id),
        code: typeof o.code === 'string' ? o.code : null,
        tickets: active.get(String(o.id)) ?? 0,
        anyScanned: scanned.has(String(o.id)),
      }))
    },

    // Seats left, for the comp form's sold-out line (#434, story 47). Advisory:
    // the authoritative refusal is `assertCanSell` inside the sell lock.
    loadSeatsRemaining: (id) => loadSeatsRemaining(payload as unknown as CompPayload, id),

    loadMoreskanti: async () => {
      const result = await payload.find({
        collection: 'members',
        where: { and: [{ isMoreskant: { equals: true } }, { active: { not_equals: false } }] },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      return result.docs as unknown as Record<string, unknown>[]
    },
  })
}
