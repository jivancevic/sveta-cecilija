import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { handleOwnAccess } from '@/lib/app/own-access'
import { appRequestMeta } from '@/lib/app/request-guard'

// PATCH /api/app/account — "E-mail i lozinka" on Profil (#651, ADR-0028).
//
// Wiring only; every rule is `src/lib/app/own-access.ts`, and the four that
// keep this narrow are written out there. It replaces
// `POST /api/app/set-password`, which wrote half the same task.
//
// `requirePermission(['moreskant', 'moreska'])` is the chokepoint every
// authenticated `/app` route carries, because the local API runs
// `overrideAccess: true` and collection access gates nothing (CLAUDE.md hard
// rule). The row written is `user.id` off the RESOLVED SESSION and never an id
// from the body; a body that names another account is refused by the handler
// rather than ignored, so nothing a caller sends can move the target.
//
// PATCH rather than POST: it changes part of one existing row, and the two
// fields are independent — a dancer with an address may send only a password.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? '')
}

/** Postgres' unique violation on `users.email`, as Payload re-throws it. */
function isDuplicateEmail(err: unknown): boolean {
  return /duplicate key|unique constraint|already (registered|in use)/i.test(message(err))
}

/**
 * The Users `beforeValidate` refusing to leave a named person without an
 * address (`user-email-policy.ts`).
 *
 * Matched on the SENTENCE rather than on the error class, because the hook
 * re-wraps it as Payload's `APIError` to get a clean 400 in the Backoffice, and
 * the original type does not survive that.
 */
function isEmailRequired(err: unknown): boolean {
  return /an email address is required/i.test(message(err))
}

export async function PATCH(req: Request) {
  const gate = await requirePermission(req, ['moreskant', 'moreska'])
  if (gate.error) return gate.error
  const { payload, user } = gate

  const body = await req.json().catch(() => null)

  const result = await handleOwnAccess(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    // `shared` reaches us because Payload's JWT strategy loads the account with
    // `overrideAccess: true`, the same reason `permissions` does; the field
    // lock on it applies to `/api/users/me`, not to this.
    caller: { id: user.id, shared: (user as { shared?: unknown }).shared },
    save: async (userId, patch) => {
      try {
        await payload.update({
          collection: 'users',
          id: userId,
          data: patch as never,
          overrideAccess: true,
        })
      } catch (err) {
        // Two failures a reader can act on, and one sentence each. Everything
        // else throws on and becomes the handler's 500.
        if (isEmailRequired(err)) return 'email-required'
        if (isDuplicateEmail(err)) return 'email-taken'
        throw err
      }
    },
  })

  return NextResponse.json(result.body, { status: result.status })
}
