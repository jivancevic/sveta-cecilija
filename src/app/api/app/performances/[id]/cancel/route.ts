import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleCancelPerformance } from '@/lib/app/performance-form'
import { performanceFormDeps } from '@/lib/app/performance-form-deps'

// POST /api/app/performances/[id]/cancel — Otkaži izvedbu (#503).
//
// A booking sells no tickets, so cancelling one is a plain status flip with
// nobody to refund and nobody to mail; the roster hears about it through the
// Shows `afterChange` hook like any other change.
//
// It refuses a PUBLIC row on purpose and is not a cheaper version of #497:
// cancelling a Redovna refunds every buyer and mails them, and that action is
// `POST /api/shows/[id]/cancel`, behind `tickets` + `refunds`.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error

  const { id } = await params

  const result = await handleCancelPerformance(id, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    ...performanceFormDeps(gate.user),
  })

  return NextResponse.json(result.body, { status: result.status })
}
