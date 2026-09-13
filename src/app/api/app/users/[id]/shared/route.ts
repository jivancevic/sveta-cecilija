import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleSetShared } from '@/lib/app/users-admin'
import { createSetSharedDeps } from '@/lib/app/users-data'
import { callerOf } from '@/lib/app/users-caller'

// POST /api/app/users/[id]/shared — "Dijeljeni račun" (#510, ADR-0022).
//
// Wiring only. The one rule worth knowing at the call site is in
// `handleSetShared`: never on the caller's own login, because the flag is
// precisely what a shared account may not edit and the mistake would have no
// undo from inside the app.
//
// `requirePermission(req, 'users')` FIRST: `Users.shared` is field-locked to a
// `users` holder and the seam writes with `overrideAccess: true`.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'users')
  if (gate.error) return gate.error

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handleSetShared(
    id,
    body,
    createSetSharedDeps(
      appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
      callerOf(gate.user),
      { user: gate.user },
    ),
  )

  return NextResponse.json(result.body, { status: result.status })
}
