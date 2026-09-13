import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleEditPerformance } from '@/lib/app/performance-form'
import { performanceFormDeps } from '@/lib/app/performance-form-deps'

// PATCH /api/app/performances/[id] — Uredi izvedbu (#503, #502).
//
// One route and one rule since #567 (Q53): either half of Izvedbe may correct
// either kind of evening. The refusal is still the handler's rather than the
// collection's, because `overrideAccess: true` means the `canEditScheduleField`
// lock on date, time, kind and status does not run for a local-API write.
//
// What may change is decided by the ROW, and that is the point: a booking's
// five fields include its DATE, a public evening's three deliberately do not
// (#379's reschedule mails every buyer and reissues every ticket), and the
// house of a sold public evening moves through *Preseli u zimsko*, which tells
// the buyers (#94). Those are facts about the evening, not about the caller.

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
