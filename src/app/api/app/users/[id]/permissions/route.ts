import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleUpdatePermissions } from '@/lib/app/users-admin'
import { createUpdatePermissionsDeps } from '@/lib/app/users-data'
import { callerOf } from '@/lib/app/users-caller'

// PATCH /api/app/users/[id]/permissions — "Dozvole" (#510).
//
// Wiring only; the three refusals (the self-lockout, a shared login on its own
// row, the e-mail a named person needs) are `handleUpdatePermissions` in
// `src/lib/app/users-admin.ts` and unit-tested there.
//
// `requirePermission(req, 'users')` FIRST. `Users.permissions` is field-locked
// to a `users` holder, and the seam writes with `overrideAccess: true`, so this
// line is the lock: without it the route would grant any permission to anybody
// and answer 200 while doing it.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'users')
  if (gate.error) return gate.error

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handleUpdatePermissions(
    id,
    body,
    createUpdatePermissionsDeps(
      appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
      callerOf(gate.user),
      { user: gate.user },
    ),
  )

  return NextResponse.json(result.body, { status: result.status })
}
