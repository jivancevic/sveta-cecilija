import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleThresholds } from '@/lib/app/performance-form'
import { performanceFormDeps } from '@/lib/app/performance-form-deps'

// POST /api/app/performances/[id]/thresholds — Pragovi crni / bili (#503).
//
// The one voditelj write that reaches a PUBLIC performance too, and the
// collection agrees: `canEditRosterField` asks only for `moreska` and never
// about the row, because how many crni and bili an evening needs is a fact
// about the dance rather than about the ticket shop.
//
// Both numbers are sent together and validated together: a body carrying only
// one would silently leave the other at whatever it was, which is not something
// a stepper with two values can express.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handleThresholds(id, body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    ...performanceFormDeps(gate.user),
  })

  return NextResponse.json(result.body, { status: result.status })
}
