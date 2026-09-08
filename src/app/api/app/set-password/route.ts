import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { generatePayloadCookie } from 'payload/shared'
import config from '@payload-config'
import { handleSetPassword } from '@/lib/app/set-password'
import { appRequestMeta } from '@/lib/app/request-guard'

// POST /api/app/set-password — the end of both account mails (#424).
//
// Wiring only; the rules are in `src/lib/app/set-password.ts`. Payload's
// `resetPassword` both stores the hash and opens a session, so the same cookie
// the login route sets goes back with the 200 and the dancer lands on `/app`
// signed in.
//
// Unauthenticated by nature (the token IS the authentication), which is why it
// carries the `/app` cross-site guard like the login route rather than
// `requirePermission`. `overrideAccess: true` because there is no session user
// yet to pass a collection access check.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const payload = await getPayload({ config })
  const body = await req.json().catch(() => null)

  const result = await handleSetPassword(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    resetPassword: (data) =>
      payload.resetPassword({
        collection: 'users',
        data,
        overrideAccess: true,
      }),
    cookie: (token) =>
      generatePayloadCookie({
        collectionAuthConfig: payload.collections.users.config.auth,
        cookiePrefix: payload.config.cookiePrefix,
        token,
      }),
  })

  const response = NextResponse.json(result.body, { status: result.status })
  if (result.setCookie) response.headers.set('Set-Cookie', result.setCookie)
  return response
}
