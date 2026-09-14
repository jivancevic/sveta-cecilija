import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleUpdateName } from '@/lib/app/users-admin'
import { createSetNameDeps } from '@/lib/app/users-data'
import { callerOf } from '@/lib/app/users-caller'

// PATCH /api/app/users/[id]/name — "Ime" (#617).
//
// Wiring only; the rules (a shared CALLER, the 404, empty clears) are
// `handleUpdateName` in `src/lib/app/users-admin.ts` and unit-tested there.
//
// `Users.name` is the ONE unlocked field on this collection — a person
// correcting the spelling of their own name grants themselves nothing — so
// unlike the other six routes on this screen, `requirePermission` here is the
// ordinary permission check rather than the thing standing in for a field lock.
// It is still first, and still in the handler: the seam writes with
// `overrideAccess: true`, so nothing else on this path asks who is calling.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'users')
  if (gate.error) return gate.error

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handleUpdateName(
    id,
    body,
    createSetNameDeps(
      appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
      callerOf(gate.user),
      { user: gate.user },
    ),
  )

  return NextResponse.json(result.body, { status: result.status })
}
