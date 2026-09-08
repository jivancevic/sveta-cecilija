import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import {
  loadSelfCompOrder,
  resolveSelfCompActor,
  voidSelfCompOrder,
  type CompPayload,
} from '@/lib/app/comp-data'
import { handleSelfCompCancel } from '@/lib/comp/self-comp'

// POST /api/app/comp/cancel — a moreškant gives their own comps back (#434).
//
// Whole order only, and only their own self-issued one: cancelling a single
// ticket, or a voditelj cancelling somebody else's comp from `/app`, are both
// out of scope (#430) and stay in `/admin`. It reuses the SAME void primitive
// the admin cancel uses (`voidOrderTickets`, reason 'storno'), so the seats come
// back the instant the tickets go inactive — seats are COUNT(active tickets).
//
// The gate is `requirePermission(req, 'moreskant')` plus the Member resolution,
// exactly as the issue route; the refusals (not yours, scanned, started) live in
// `src/lib/comp/self-comp.ts`.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreskant')
  if (gate.error) return gate.error
  const { payload, user } = gate
  const p = payload as unknown as CompPayload

  const actor = await resolveSelfCompActor(p, user as { id?: string | number; member?: unknown })
  const body = await req.json().catch(() => null)

  const result = await handleSelfCompCancel(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    actor,
    loadOrder: (orderId) => loadSelfCompOrder(p, orderId),
    voidOrder: (orderId) => voidSelfCompOrder(p, orderId),
  })

  return NextResponse.json(result.body, { status: result.status })
}
