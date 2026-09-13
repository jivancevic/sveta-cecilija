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
// The gate lets EITHER half of Izvedbe in and the handler decides which kind of
// row this particular body may become (#502): a public evening needs `tickets`,
// a booking needs `moreska`. That split is a property of the row rather than of
// the URL, which is why it is settled in `performance-form.ts` and re-checked
// there against the caller's own set rather than assumed from the gate.

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
