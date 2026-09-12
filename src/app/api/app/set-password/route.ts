import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { handleSetPassword } from '@/lib/app/set-password'
import { appRequestMeta } from '@/lib/app/request-guard'

// POST /api/app/set-password — "Postavi lozinku" in Više (#424, rewritten #463).
//
// Wiring only; the rules are in `src/lib/app/set-password.ts`.
//
// It is no longer the end of an account mail and no longer takes a token: since
// #463 a link opens the session (`POST /api/app/session`), so the caller here
// is an ordinary signed-in dancer changing something about their own account.
// That makes it a staff-shaped route rather than a token one, which is why it
// carries `requirePermission(['moreskant', 'moreska'])` — the chokepoint every
// authenticated `/app` route uses, because the local API runs
// `overrideAccess: true` and collection access gates nothing (CLAUDE.md hard
// rule) — and then the `/app` cross-site guard.
//
// The caller's own id is the only row it may write: it comes from the resolved
// session, never from the body, so there is no target to tamper with.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, ['moreskant', 'moreska'])
  if (gate.error) return gate.error
  const { payload, user } = gate

  const body = await req.json().catch(() => null)

  const result = await handleSetPassword(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    // `shared` reaches us because Payload's JWT strategy loads the account with
    // `overrideAccess: true`, the same reason `permissions` does; the field
    // lock on it applies to `/api/users/me`, not to this.
    caller: { id: user.id, shared: (user as { shared?: unknown }).shared },
    setPassword: async (userId, password) => {
      await payload.update({
        collection: 'users',
        id: userId,
        data: { password } as never,
        overrideAccess: true,
      })
    },
  })

  return NextResponse.json(result.body, { status: result.status })
}
