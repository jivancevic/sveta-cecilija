import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleResetPassword } from '@/lib/app/users-account'
import { createResetPasswordDeps } from '@/lib/app/users-data'
import { callerOf } from '@/lib/app/users-caller'

// POST /api/app/users/[id]/reset-password — "Resetiraj lozinku" (#510).
//
// Wiring only; the two branches (an address gets a link, an address-less login
// gets a new temporary password) are `handleResetPassword` in
// `src/lib/app/users-account.ts`.
//
// `requirePermission(req, 'users')` FIRST: this route answers with a live
// credential for somebody else's account. The body is never logged, here or in
// the handler.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'users')
  if (gate.error) return gate.error

  const { id } = await params

  const result = await handleResetPassword(
    id,
    createResetPasswordDeps(
      appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
      callerOf(gate.user),
      { user: gate.user },
    ),
  )

  return NextResponse.json(result.body, { status: result.status })
}
