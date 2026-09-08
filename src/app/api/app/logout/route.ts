import { NextResponse } from 'next/server'
import { createLocalReq, getPayload, logoutOperation } from 'payload'
import { generateExpiredPayloadCookie } from 'payload/shared'
import config from '@payload-config'
import { handleAppLogout } from '@/lib/app/login'
import { appRequestMeta } from '@/lib/app/request-guard'

// POST /api/app/logout — ends the shared Payload session (#421).
//
// Clearing the cookie is only half of it. Users has `useSessions` on (Payload's
// default), so the JWT stays valid for its full 30 days as long as its `sid`
// is still in `users.sessions`: a copy of the cookie taken before "Odjava"
// would keep working. Payload's own `logoutOperation` removes that row, which
// is what actually signs the dancer out; the expired cookie then drops the
// browser's copy. Always 200 — signing out of a session that is already gone
// is a success — and the expired cookie is Payload's own, so it matches the
// login cookie in name, path and attributes.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const payload = await getPayload({ config })

  const result = await handleAppLogout({
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    invalidateSession: async () => {
      const { user } = await payload.auth({ headers: req.headers })
      if (!user) return
      // `logoutOperation` filters `users.sessions` by `req.user._sid`, so the
      // authenticated user has to be the one on the local req.
      await logoutOperation({
        collection: payload.collections.users,
        req: await createLocalReq({ user }, payload),
      })
    },
    expiredCookie: () =>
      generateExpiredPayloadCookie({
        collectionAuthConfig: payload.collections.users.config.auth,
        cookiePrefix: payload.config.cookiePrefix,
      }),
  })

  const response = NextResponse.json(result.body, { status: result.status })
  if (result.setCookie) response.headers.set('Set-Cookie', result.setCookie)
  return response
}
