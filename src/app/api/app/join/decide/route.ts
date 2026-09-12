import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleJoinDecide } from '@/lib/app/join'
import { approveJoinClaim, findClaimById, poolQuery, rejectJoinClaim } from '@/lib/app/join-store'
import { ensureJoinLogin, loadJoinMember, memberHasLogin } from '@/lib/app/join-data'

// POST /api/app/join/decide — the voditelj's one tap (#463).
//
// Wiring only; the rules are in `src/lib/app/join.ts`.
//
// `requirePermission(req, 'moreska')` FIRST, before the cross-site guard and
// before any read: approving a claim CREATES A LOGIN, which is the most
// privileged thing anything under `/app` does. The local API runs
// `overrideAccess: true`, so nothing below this line gates it (CLAUDE.md hard
// rule), and the pending list that calls it is UX rather than the boundary.
//
// This is the human half of the design, and the reason there is no SMS code:
// the voditelj is in the room, looking at the person whose name is on the
// screen. No gateway proves that as well.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload, user } = gate

  const query = poolQuery(payload)
  const body = await req.json().catch(() => null)

  const result = await handleJoinDecide(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    now: () => Date.now(),
    caller: { id: user.id },
    loadClaim: (claimId) => findClaimById(query, claimId),
    loadMember: (memberId) => loadJoinMember(payload, memberId),
    memberHasLogin: (memberId) => memberHasLogin(payload, memberId),
    ensureLogin: (member) => ensureJoinLogin(payload, member),
    approve: (claimId, userId, deciderId) => approveJoinClaim(query, claimId, userId, deciderId),
    reject: (claimId, deciderId) => rejectJoinClaim(query, claimId, deciderId),
  })

  return NextResponse.json(result.body, { status: result.status })
}
