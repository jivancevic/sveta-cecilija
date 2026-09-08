import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import {
  countOwnSelfComps,
  issueSelfComp,
  loadSelfCompPerformance,
  resolveSelfCompActor,
  type CompPayload,
} from '@/lib/app/comp-data'
import { handleSelfCompIssue } from '@/lib/comp/self-comp'

// POST /api/app/comp/issue — a moreškant issues their own free tickets (#434).
//
// `requirePermission(req, 'moreskant')`: the local API runs `overrideAccess:
// true`, so the Orders collection access does not gate this handler (CLAUDE.md
// hard rule). Holding the permission is only half the door — the caller must
// also BE a live dancer, which is what `resolveSelfCompActor` establishes with
// the same Member resolution the `/app` access decision uses. A voditelj with no
// Member link gets 403 and a Croatian sentence (#430, story 55).
//
// Everything else is elsewhere: the rules in `src/lib/comp/self-comp.ts`, the
// Payload calls in `src/lib/app/comp-data.ts`, and the order itself in the one
// comp engine `/api/comp/issue` also uses.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreskant')
  if (gate.error) return gate.error
  const { payload, user } = gate
  const p = payload as unknown as CompPayload

  const actor = await resolveSelfCompActor(p, user as { id?: string | number; member?: unknown })
  // The handler refuses a null actor before it reaches either dep, so the empty
  // string below is unreachable rather than a fallback with a meaning.
  const memberId = actor?.memberId ?? ''
  const body = await req.json().catch(() => null)

  const result = await handleSelfCompIssue(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    actor,
    loadPerformance: (id) => loadSelfCompPerformance(p, id),
    countOwnSelfComps: (id) => countOwnSelfComps(p, id, memberId),
    issue: (args) => issueSelfComp(p, { ...args, memberId }),
  })

  return NextResponse.json(result.body, { status: result.status })
}
