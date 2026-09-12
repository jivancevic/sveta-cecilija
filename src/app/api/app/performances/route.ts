import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleCreatePerformance } from '@/lib/app/performance-form'
import { performanceFormDeps } from '@/lib/app/performance-form-deps'

// POST /api/app/performances — Dodaj izvedbu (#503).
//
// `requirePermission(req, 'moreska')`: the local API runs `overrideAccess:
// true`, so the collection access on Shows does NOT gate this handler (CLAUDE.md
// hard rule). The `/app` cross-site guard is inside the pure handler, as on
// every other cookie-authenticated `/app` POST.
//
// The row it writes can only ever be non-public: the shared validator refuses
// `redovna`, and the collection's `nonPublicAuthoringOverrides` forces the flag
// down again for a caller without `tickets`. A public show is born in the
// backoffice and nowhere else.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error

  const body = await req.json().catch(() => null)
  const result = await handleCreatePerformance(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    ...performanceFormDeps(gate.user),
  })

  return NextResponse.json(result.body, { status: result.status })
}
