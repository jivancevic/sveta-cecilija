// The Payload-backed `AuthRepo` (#475, seam research section 2.5).
//
// `payload.auth()` verifies the `payload-token` cookie (or an `Authorization:
// JWT` header) and loads the account through the local API with
// `overrideAccess: true`, which is why the field-locked `permissions`, `member`
// and `partner` ride along on `req.user`. Payload's CSRF/Origin gate applies to
// the cookie path by design: a cross-site navigation into `/scan/[token]`
// resolves to no user, which is what keeps the buyer view safe.
//
// The projection is deliberate rather than a spread: a Payload user document
// carries `salt`, `hash`, `loginAttempts` and the session list, and none of
// those may leave the seam.

import { permissionsOf } from '@/lib/access/permissions'
import { relationIdString } from '@/lib/payload-relation'
import type { AuthRepo, SessionUser } from '../auth'
import { payloadClient, type PayloadClient } from './client'

function toSessionUser(user: Record<string, unknown>): SessionUser {
  return {
    id: user.id as string | number,
    permissions: permissionsOf(user as { permissions?: unknown }),
    memberId: relationIdString(user.member),
    partnerId: relationIdString(user.partner),
    username: typeof user.username === 'string' ? user.username : null,
    email: typeof user.email === 'string' ? user.email : null,
  }
}

export function createAuthRepo(load: () => Promise<PayloadClient> = payloadClient): AuthRepo {
  return {
    async userFromHeaders(headers) {
      const payload = await load()
      const { user } = await payload.auth({ headers })
      if (!user) return null
      return toSessionUser(user as unknown as Record<string, unknown>)
    },
  }
}
