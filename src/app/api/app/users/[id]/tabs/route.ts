import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleSetTabs } from '@/lib/app/users-tabs'
import { createSetTabsDeps } from '@/lib/app/users-data'
import { callerOf } from '@/lib/app/users-caller'

// PATCH /api/app/users/[id]/tabs — "Tabovi" (#563).
//
// Wiring only; the rules are `handleSetTabs` in `src/lib/app/users-tabs.ts` and
// unit-tested there: nobody arranges their own bar (409), and a key the account
// does not unlock is refused rather than stored (400), because a tab is an
// order and never a permission.
//
// `requirePermission(req, 'users')` FIRST, as on the other five. `Users.tabs` is
// field-locked to a `users` holder and the seam writes with
// `overrideAccess: true`, so this line is the lock.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'users')
  if (gate.error) return gate.error

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handleSetTabs(
    id,
    body,
    createSetTabsDeps(
      appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
      callerOf(gate.user),
      { user: gate.user },
    ),
  )

  return NextResponse.json(result.body, { status: result.status })
}
