import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handlePausePerformance } from '@/lib/app/performance-form'
import { performanceFormDeps } from '@/lib/app/performance-form-deps'

// POST /api/app/performances/[id]/pause — Pauziraj / Nastavi online prodaju (#502).
//
// The one action on this screen whose route did NOT already exist. The pause
// shipped in #366 as a checkbox on the Shows form and nothing else: the only
// way to flip it was the Backoffice, which is exactly the kind of raw-edit
// errand Cecilija replaces (ADR-0027). Everything else the blagajna does here
// reuses a route unchanged.
//
// `tickets`, because a public evening's sale is the blagajna's; the handler
// refuses a non-public row, which sells nothing to pause.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'tickets')
  if (gate.error) return gate.error

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handlePausePerformance(id, body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    ...performanceFormDeps(gate.user),
  })

  return NextResponse.json(result.body, { status: result.status })
}
