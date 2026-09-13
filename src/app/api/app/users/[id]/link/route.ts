import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleLinkUser } from '@/lib/app/users-link'
import { createLinkUserDeps } from '@/lib/app/users-data'
import { callerOf } from '@/lib/app/users-caller'

// POST /api/app/users/[id]/link — "Poveži partnera" / "Poveži člana" (#510).
//
// Wiring only; the refusals are `handleLinkUser` in `src/lib/app/users-link.ts`
// and they are #487's, in `/app/account`'s own vocabulary: a Member who already
// has a login is `taken`, a retired or non-moreškant one is refused.
//
// `requirePermission(req, 'users')` FIRST, and it matters more here than
// anywhere else on this screen: `Users.member` is field-locked for READ and
// WRITE, and that lock is what stops a login being repointed at somebody else's
// roster identity. This route bypasses it by design, so this line IS the lock.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'users')
  if (gate.error) return gate.error

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handleLinkUser(
    id,
    body,
    createLinkUserDeps(
      appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
      callerOf(gate.user),
      { user: gate.user },
    ),
  )

  return NextResponse.json(result.body, { status: result.status })
}
