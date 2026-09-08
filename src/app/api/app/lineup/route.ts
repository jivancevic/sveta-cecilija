import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleLineupReplace, type LineupPerformance } from '@/lib/lineup/replace'
import { createLineupStore, type LineupStorePayload } from '@/lib/lineup/lineup-store'
import { replaceLineupInTransaction } from '@/lib/lineup/write-tx'
import { toAttendanceMember } from '@/lib/attendance/rules'

// POST /api/app/lineup — the ONE writer of a postava (#432).
//
// `requirePermission(req, 'moreska')`: a lineup is the voditelj's record of who
// danced, and a dancer never writes one. The local API runs
// `overrideAccess: true`, so the collection access does NOT gate this handler —
// the guard does (CLAUDE.md hard rule). The `/app` cross-site guard lives in the
// pure handler, as on every other cookie-authenticated `/app` POST.
//
// Everything transactional is one call: `replaceLineupInTransaction` takes the
// shows row lock, re-reads the confirmation flag and only then deletes and
// inserts, so a Potvrdi landing mid-save refuses the write instead of locking
// the wrong list (#442 review). The ORDER lives in `lineup/write-tx.ts` and the
// four statements in `lineup/lineup-store.ts`; this file is wiring.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload, user } = gate

  const body = await req.json().catch(() => null)
  const store = createLineupStore(payload as unknown as LineupStorePayload, user)

  const result = await handleLineupReplace(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),

    // The cheap pre-check: it saves a transaction on the ordinary 400/409 and
    // proves nothing about the moment of the write, which is why the locked
    // re-check inside the transaction is the one that decides.
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

    replaceEntries: (performanceId, entries) =>
      replaceLineupInTransaction(performanceId, entries, store),
  })

  return NextResponse.json(result.body, { status: result.status })
}
