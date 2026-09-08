import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleLineupReplace, type LineupPerformance } from '@/lib/lineup/replace'
import { toAttendanceMember } from '@/lib/attendance/rules'
import type { LineupEntry } from '@/lib/lineup/rules'

// POST /api/app/lineup — the ONE writer of a postava (#432).
//
// `requirePermission(req, 'moreska')`: a lineup is the voditelj's record of who
// danced, and a dancer never writes one. The local API runs
// `overrideAccess: true`, so the collection access does NOT gate this handler —
// the guard does (CLAUDE.md hard rule). The `/app` cross-site guard lives in the
// pure handler, as on every other cookie-authenticated `/app` POST.
//
// THE TRANSACTION IS HERE, not in the rules: a replace deletes every row of the
// performance and inserts the new list, and half of that is a confirmed evening
// with nobody in it. `payload.db.beginTransaction()` gives a transaction id that
// every local-API call carries on `req`, so the delete and the inserts commit or
// roll back together; a failure re-throws after the rollback and the route
// answers 500 rather than silently losing the postava.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Relationship ids as the database wants them.
 *
 * The same wiring concern the attendance route documents: the pure handler
 * works in strings (an id off a JSON body is a string) while the Postgres
 * adapter's relationship columns are integers, and Payload validates the type
 * on write.
 */
function relId(value: string | number): string | number {
  const n = Number(value)
  return Number.isInteger(n) && String(n) === String(value).trim() ? n : value
}

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload, user } = gate

  const body = await req.json().catch(() => null)

  const result = await handleLineupReplace(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),

    loadPerformance: async (id): Promise<LineupPerformance | null> => {
      try {
        const doc = (await payload.findByID({
          collection: 'shows',
          id,
          depth: 0,
          overrideAccess: true,
        })) as unknown as Record<string, unknown> | null
        if (!doc) return null
        return { id: String(doc.id), confirmed: doc.lineupConfirmed === true }
      } catch {
        // A bad id in the body is a 400 from the handler, never a 500 from here.
        return null
      }
    },

    loadRoster: async () => {
      const result = await payload.find({
        collection: 'members',
        where: { and: [{ isMoreskant: { equals: true } }, { active: { not_equals: false } }] },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      return (result.docs as unknown as Record<string, unknown>[]).map(toAttendanceMember)
    },

    replaceEntries: async (performanceId: string, entries: readonly LineupEntry[]) => {
      const transactionID = await payload.db.beginTransaction()
      // A database adapter without transaction support returns null; the writes
      // then run unwrapped rather than not at all, which is what the local API
      // does with every other call in this codebase.
      const reqArg = transactionID ? ({ transactionID } as never) : undefined
      try {
        await payload.delete({
          collection: 'lineups',
          where: { performance: { equals: performanceId } },
          overrideAccess: true,
          req: reqArg,
        })
        for (const entry of entries) {
          await payload.create({
            collection: 'lineups',
            data: {
              performance: relId(performanceId),
              member: relId(entry.memberId),
              role: entry.role,
            } as never,
            overrideAccess: true,
            user,
            req: reqArg,
          })
        }
        if (transactionID) await payload.db.commitTransaction(transactionID)
      } catch (err) {
        if (transactionID) await payload.db.rollbackTransaction(transactionID)
        throw err
      }
    },
  })

  return NextResponse.json(result.body, { status: result.status })
}
