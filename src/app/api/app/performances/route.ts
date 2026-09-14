import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleCreatePerformance } from '@/lib/app/performance-form'
import { performanceFormDeps } from '@/lib/app/performance-form-deps'

// POST /api/app/performances — Dodaj izvedbu (#503, #502).
//
// `requirePermission`: the local API runs `overrideAccess: true`, so the
// collection access on Shows does NOT gate this handler (CLAUDE.md hard rule).
// The `/app` cross-site guard is inside the pure handler, as on every other
// cookie-authenticated `/app` POST.
//
// The gate lets EITHER half of Izvedbe in, and since #567 (Q53) so does the
// handler: a voditelj and the secretary may both enter both kinds of evening,
// because a season's schedule is one job. The handler still re-checks the set
// it was handed (`mayWritePerformance`) rather than trusting the gate, because
// the local API runs `overrideAccess: true` and the collection cannot be the
// one to say no; what it no longer does is ask WHICH half is knocking.
//
// The money and the buyers are where the two halves still part, and that is one
// permission per ACTION in the routes those actions have
// (`/api/shows/[id]/{cancel,reschedule,move-to-indoor,offline-sales}` and
// `…/[id]/pause`), mapped for the screen by `lib/app/performance-actions.ts`.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, ['moreska', 'tickets'])
  if (gate.error) return gate.error

  const body = await req.json().catch(() => null)
  const result = await handleCreatePerformance(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    ...performanceFormDeps(gate.user),
  })

  return NextResponse.json(result.body, { status: result.status })
}
