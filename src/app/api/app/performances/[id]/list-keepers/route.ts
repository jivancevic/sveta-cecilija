import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { listKeepersOf, loadShowRow, type ShowRowReader } from '@/lib/app/show-row'
import {
  handleListKeeperWrite,
  type ListKeeperCandidate,
  type ListKeeperPerformance,
} from '@/lib/app/list-keeper-write'
import { createPushDeps, type PushPayload } from '@/lib/push/push-data'
import { relationIdForWrite } from '@/lib/payload-relation'

// POST /api/app/performances/[id]/list-keepers — naming this evening's Zaduženi
// (#658, ADR-0029).
//
// `requirePermission(req, 'moreska')` and nothing wider, on purpose. This is the
// ONE route in the feature that a Zaduženi may not call: a delegation that can
// be passed on is a delegation nobody can follow, so the person keeping tonight's
// list cannot appoint tomorrow's. The local API runs `overrideAccess: true`, so
// the collection access does not gate this — the guard does (CLAUDE.md hard
// rule), and `listKeepers` is a roster field the collection locks to `moreska`
// anyway.
//
// Everything else — the switch, the live-dancer check, the one push and the
// silence on removal — is `lib/app/list-keeper-write.ts`, tested without a
// database. This file is wiring.
//
// THE WRITE IS A READ-MODIFY-WRITE of a relationship array and is NOT atomic.
// Two voditelji naming two different people in the same second would leave one
// of the two names off. Left as it is deliberately: there are two `moreska`
// holders, the action is rare and deliberate, and the result of the loss is
// visible on the very screen that caused it, one tap from being redone. The
// atomicity rule this repo does enforce (CLAUDE.md) is about ACCUMULATING
// counters, where a lost update is invisible and compounds; this is neither.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload, user } = gate

  const { id } = await params
  const body = await req.json().catch(() => null)
  const push = createPushDeps(payload as unknown as PushPayload)

  const result = await handleListKeeperWrite(id, body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),

    loadPerformance: async (performanceId): Promise<ListKeeperPerformance | null> => {
      const doc = await loadShowRow(payload as unknown as ShowRowReader, performanceId)
      if (!doc) return null
      return {
        id: String(doc.id),
        date: String(doc.date ?? '').slice(0, 10),
        time: typeof doc.time === 'string' ? doc.time : '',
        listKeepers: listKeepersOf(doc),
      }
    },

    loadMember: async (memberId): Promise<ListKeeperCandidate | null> => {
      try {
        const doc = (await payload.findByID({
          collection: 'members',
          id: memberId,
          depth: 0,
          overrideAccess: true,
        })) as unknown as Record<string, unknown> | null
        if (!doc) return null
        return {
          id: String(doc.id),
          active: doc.active !== false,
          isMoreskant: doc.isMoreskant === true,
        }
      } catch {
        return null
      }
    },

    save: async (performanceId, memberIds) => {
      await payload.update({
        collection: 'shows',
        id: performanceId,
        // Through the collection rather than raw SQL, so the Shows hooks run.
        // The change-notification hook diffs date, time, place, cancellation and
        // the voditelj note only, so naming a Zaduženi rings no roster phone —
        // the ONE phone it rings is the new keeper's, from the handler.
        data: { listKeepers: memberIds.map((memberId) => relationIdForWrite(memberId)) } as never,
        overrideAccess: true,
        user,
      })
    },

    // The store answers Member id → user id as a Map (a Member with no login
    // simply has no entry, which is how a dancer who has not been invited yet
    // is named without anything being sent).
    loadUserIdsByMember: async (memberIds) => [
      ...(await push.loadUserIdsByMember(memberIds)).values(),
    ],
    send: push.send,
  })

  return NextResponse.json(result.body, { status: result.status })
}
