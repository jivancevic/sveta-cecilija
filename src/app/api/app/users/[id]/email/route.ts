import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleUpdateEmail } from '@/lib/app/users-admin'
import { createSetEmailDeps } from '@/lib/app/users-data'
import { callerOf } from '@/lib/app/users-caller'

// PATCH /api/app/users/[id]/email — "E-mail" (#621).
//
// Wiring only; the rules (the named-person set that may not lose its address,
// the taken address, the no-op, empty clears) are `handleUpdateEmail` in
// `src/lib/app/users-admin.ts` and unit-tested there.
//
// `requirePermission(req, 'users')` FIRST, and here it guards an AUTH field
// rather than a cosmetic one: this column is what a sign-in link and a
// forgotten-password letter are addressed to, so a caller who could write it
// could redirect the way into somebody else's account. The seam writes with
// `overrideAccess: true`, so this line is the only thing asking who is calling.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'users')
  if (gate.error) return gate.error

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handleUpdateEmail(
    id,
    body,
    createSetEmailDeps(
      appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
      callerOf(gate.user),
      { user: gate.user },
    ),
  )

  return NextResponse.json(result.body, { status: result.status })
}
