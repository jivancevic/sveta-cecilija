import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleCreateUser } from '@/lib/app/users-account'
import { createCreateUserDeps } from '@/lib/app/users-data'
import { callerOf } from '@/lib/app/users-caller'

// POST /api/app/users — "Novi korisnik" (#510).
//
// Wiring only; every rule is `handleCreateUser` in `src/lib/app/users-account.ts`
// and unit-tested there.
//
// `requirePermission(req, 'users')` FIRST, before the cross-site guard and
// before anything is read: this route opens an account and answers with a live
// credential — a temporary password, or a sign-in link that IS a session. The
// seam writes with `overrideAccess: true`, so the field locks on `permissions`
// and `shared` do not run here (CLAUDE.md hard rule), and the screen that calls
// this is UX rather than the boundary. This check is the boundary.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'users')
  if (gate.error) return gate.error

  const body = await req.json().catch(() => null)

  const result = await handleCreateUser(
    body,
    createCreateUserDeps(
      appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
      callerOf(gate.user),
      { user: gate.user },
    ),
  )

  return NextResponse.json(result.body, { status: result.status })
}
