// The Payload half of the MCP tools (#438) — the `roster-data.ts` shape.
//
// Every rule lives in the pure `tools.ts`; this file holds the queries and
// nothing else, so a tool can be unit-tested against a fake store and the route
// is only wiring.
//
// The local API runs with `overrideAccess: true`, so collection access scopes
// none of these reads. That is the same decision `/app` made and it is safe for
// the same reason: the caller has already established that the token's user
// holds `moreska` (the MCP route re-checks it on EVERY call), and roster
// visibility is society-wide. The one thing that does NOT relax is the PII
// boundary — `toMcpMoreskant` is an explicit projection with no mobile and no
// e-mail, exactly like `toAppMember`.
//
// The shows reads deliberately carry no public predicate: a moreškant roster
// covers EVERY performance of the season (ADR-0024), and a ship call is exactly
// the kind of evening a voditelj dictates a lineup for. This file is on the
// `show-performance-guard` allow-list with that justification.

import { relationIdString } from '@/lib/payload-relation'
import { toAttendanceMember } from '@/lib/attendance/rules'
import { performancePlace } from '@/lib/app/performance-place'
import { toIsoDate } from '@/lib/to-iso-date'
import { isDanceRole } from '@/lib/moreskant-profile'
import { loadMemberIdsWithLogin } from '@/lib/access/member-logins'
import { replaceLineupInTransaction } from '@/lib/lineup/write-tx'
import { createLineupStore, type LineupStorePayload } from '@/lib/lineup/lineup-store'
import { createPerformancesInBulk } from '@/lib/performance-bulk-create'
import { createPushDeps, type PushPayload } from '@/lib/push/push-data'
import { notifyBulkCreated } from '@/lib/push/notify'
import type { Venue } from '@/lib/venues'
import type {
  McpAttendanceRow,
  McpLineupRow,
  McpMoreskant,
  McpPerformance,
  McpStore,
} from './tools'

/** The slice of `getPayload()` this store uses. */
export interface McpPayload {
  find: (args: Record<string, unknown>) => Promise<{ docs: Record<string, unknown>[] }>
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  create: (args: Record<string, unknown>) => Promise<unknown>
}

function num(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** A Shows doc → what a tool answers with. No sales, no capacity, no buyer. */
export function toMcpPerformance(doc: Record<string, unknown>): McpPerformance {
  const isPublic = doc.isPublic !== false
  return {
    id: String(doc.id),
    date: toIsoDate(doc.date),
    time: typeof doc.time === 'string' ? doc.time : '',
    kind: typeof doc.kind === 'string' ? doc.kind : 'redovna',
    isPublic,
    place: performancePlace({
      isPublic,
      venue: (str(doc.venue) as Venue | null) ?? null,
      location: str(doc.location),
    }),
    cancelled: doc.status === 'cancelled',
    note: str(doc.voditeljNote),
    lineupConfirmed: doc.lineupConfirmed === true,
    thresholdCrni: num(doc.thresholdCrni, 8),
    thresholdBili: num(doc.thresholdBili, 8),
  }
}

/**
 * A Members doc → the dancer a tool may see.
 *
 * An explicit projection, never a spread: `members.email` and `members.mobile`
 * both exist and neither belongs in an answer that lands in a chat window
 * (ADR-0024's PII boundary, the `toAppMember` rule).
 */
export function toMcpMoreskant(
  doc: Record<string, unknown>,
  hasLogin: boolean,
): McpMoreskant {
  return {
    id: String(doc.id),
    nickname: str(doc.nickname) ?? '',
    name: str(doc.name),
    active: doc.active !== false,
    roles: Array.isArray(doc.roles) ? doc.roles.filter((r): r is string => typeof r === 'string') : [],
    primaryRole: str(doc.primaryRole),
    hasLogin,
  }
}

export function createMcpStore(payload: McpPayload, user?: unknown): McpStore {
  const shows = async (where: Record<string, unknown>) => {
    const res = await payload.find({
      collection: 'shows',
      where,
      sort: 'date',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    return res.docs.map(toMcpPerformance)
  }

  return {
    listPerformances: (season) =>
      shows({
        and: [
          { date: { greater_than_equal: `${season}-01-01T00:00:00.000Z` } },
          { date: { less_than: `${season + 1}-01-01T00:00:00.000Z` } },
        ],
      }),

    getPerformance: async (id) => {
      try {
        const doc = await payload.findByID({
          collection: 'shows',
          id,
          depth: 0,
          overrideAccess: true,
        })
        return doc ? toMcpPerformance(doc) : null
      } catch {
        // A bad id from a tool call is "that izvedba does not exist", not a 500.
        return null
      }
    },

    loadRoster: async () => {
      const res = await payload.find({
        collection: 'members',
        where: { and: [{ isMoreskant: { equals: true } }, { active: { not_equals: false } }] },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      return res.docs.map(toAttendanceMember)
    },

    listMoreskanti: async () => {
      const res = await payload.find({
        collection: 'members',
        where: { isMoreskant: { equals: true } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      // ONE query for the whole list, the Members-column rule (#424): a lookup
      // per dancer would be a query per rendered line.
      const withLogin = await loadMemberIdsWithLogin(payload)
      return res.docs.map((doc) => toMcpMoreskant(doc, withLogin.has(String(doc.id))))
    },

    attendanceRows: async (performanceIds): Promise<McpAttendanceRow[]> => {
      if (performanceIds.length === 0) return []
      const res = await payload.find({
        collection: 'attendance',
        where: { performance: { in: [...performanceIds] } },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
      })
      const out: McpAttendanceRow[] = []
      for (const doc of res.docs) {
        const performanceId = relationIdString(doc.performance)
        const memberId = relationIdString(doc.member)
        if (!performanceId || !memberId) continue
        if (doc.status !== 'coming' && doc.status !== 'not_coming') continue
        out.push({
          performanceId,
          memberId,
          status: doc.status,
          army: doc.army === 'crni' || doc.army === 'bili' ? doc.army : null,
        })
      }
      return out
    },

    lineupFor: async (performanceId): Promise<McpLineupRow[]> => {
      const res = await payload.find({
        collection: 'lineups',
        where: { performance: { equals: performanceId } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      const out: McpLineupRow[] = []
      for (const doc of res.docs) {
        const memberId = relationIdString(doc.member)
        if (!memberId || !isDanceRole(doc.role)) continue
        out.push({ memberId, role: doc.role })
      }
      return out
    },

    // The SAME writer `POST /api/app/lineup` uses, row lock and all: a lineup
    // dictated to Claude and a lineup typed on the phone cannot race each other
    // into two different postave (#442 review).
    replaceLineup: (performanceId, entries) =>
      replaceLineupInTransaction(
        performanceId,
        entries,
        createLineupStore(payload as unknown as LineupStorePayload, user),
      ),

    // The SAME writer `/api/shows/bulk-create` uses: one create per row with
    // the roster-push flag, then ONE "N novih izvedbi" push (#441 review).
    createPerformances: (rows) =>
      createPerformancesInBulk(rows, {
        create: (args) => payload.create({ collection: 'shows', overrideAccess: true, user, ...args }),
        announce: (input) => {
          const push = createPushDeps(payload as unknown as PushPayload)
          void notifyBulkCreated(input, push).catch((err) =>
            console.error('[push] bulk create notification failed', err),
          )
        },
      }),
  }
}
