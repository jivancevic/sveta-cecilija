import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { listKeepersOf, loadShowRow, type ShowRowReader } from '@/lib/app/show-row'
import { listKeeperActor } from '@/lib/app/list-keeper-actor'
import type { ViewerPayload } from '@/lib/app/viewer'
import { handleLineupReplace, type LineupPerformance } from '@/lib/lineup/replace'
import { createLineupStore, type LineupStorePayload } from '@/lib/lineup/lineup-store'
import { replaceLineupInTransaction } from '@/lib/lineup/write-tx'
import { toAttendanceMember } from '@/lib/attendance/rules'
import { performanceKindOf } from '@/lib/show-performance'

// POST /api/app/lineup — the ONE writer of a postava (#432).
//
// The guard is `requirePermission(req, ['moreska','moreskant'])` followed by a
// question about the ROW, asked inside the pure handler (ADR-0029, #658): does
// this caller keep THIS evening's list? It was `'moreska'` alone until #658 — a
// lineup was the voditelj's record and a dancer never wrote one — and what
// changed is not who may write A postava but that one evening's list can be
// delegated, so the answer depends on the row and the permission alone can no
// longer give it.
//
// The widened word is NOT the authorization: a plain moreškant passes the guard
// and is then refused 403 by `keepsList` on every evening that does not name
// them. The local API runs `overrideAccess: true`, so the collection access does
// NOT gate this handler either way (CLAUDE.md hard rule). The `/app` cross-site
// guard lives in the pure handler, as on every other cookie-authenticated
// `/app` POST.
//
// Everything transactional is one call: `replaceLineupInTransaction` takes the
// shows row lock, re-reads the confirmation flag and only then deletes and
// inserts, so a Potvrdi landing mid-save refuses the write instead of locking
// the wrong list (#442 review). The ORDER lives in `lineup/write-tx.ts` and the
// four statements in `lineup/lineup-store.ts`; this file is wiring.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, ['moreska', 'moreskant'])
  if (gate.error) return gate.error
  const { payload, user } = gate

  const body = await req.json().catch(() => null)
  const store = createLineupStore(payload as unknown as LineupStorePayload, user)
  const actor = await listKeeperActor(payload as unknown as ViewerPayload, user)

  const result = await handleLineupReplace(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    actor,

    // The cheap pre-check: it saves a transaction on the ordinary 400/409 and
    // proves nothing about the moment of the write, which is why the locked
    // re-check inside the transaction is the one that decides.
    loadPerformance: async (id): Promise<LineupPerformance | null> => {
      const doc = await loadShowRow(payload as unknown as ShowRowReader, id)
      if (!doc) return null
      return {
        id: String(doc.id),
        confirmed: doc.lineupConfirmed === true,
        kind: performanceKindOf(doc.kind),
        listKeepers: listKeepersOf(doc),
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
