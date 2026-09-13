import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleEditPerformance } from '@/lib/app/performance-form'
import { performanceFormDeps } from '@/lib/app/performance-form-deps'

// PATCH /api/app/performances/[id] — Uredi izvedbu (#503, #502).
//
// One route, two halves, and the refusal is the handler's rather than the
// collection's: `overrideAccess: true` means the `canEditScheduleField` lock on
// date, time, kind and status does not run for a local-API write, so the rule
// that a voditelj never touches a PUBLIC show (it would mail every buyer, #404
// story 10) is re-checked in `handleEditPerformance` against the stored row —
// and so is its mirror, that a `tickets` holder does not re-plan a booking.
//
// What each half may change differs, and that is the point: a booking's five
// fields include its DATE, a public evening's three deliberately do not
// (#379's reschedule mails every buyer and reissues every ticket).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, ['moreska', 'tickets'])
  if (gate.error) return gate.error

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handleEditPerformance(id, body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    ...performanceFormDeps(gate.user),
  })

  return NextResponse.json(result.body, { status: result.status })
}
