import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { generatePayloadCookie } from 'payload/shared'
import config from '@payload-config'
import { handleAppLogin } from '@/lib/app/login'

// POST /api/app/login — the Moreškant app's own sign-in (#421, ADR-0023).
//
// `/app` shares Payload's session but never `/admin/login`: this route runs the
// local `login` operation and sets the very cookie Payload's admin sets, built
// by Payload's own `generatePayloadCookie` from the Users auth config (30-day
// expiry, httpOnly, path `/`, SameSite, Secure in production). The decisions —
// which field the identifier is, which status code, what the message says —
// live in `src/lib/app/login.ts` and are unit-tested there.
//
// Not a `requirePermission` route: there is no caller to authorize yet, and a
// successful login grants nothing on its own. What the account may see is the
// `/app` access decision.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const payload = await getPayload({ config })
  const body = await req.json().catch(() => null)

  const result = await handleAppLogin(body, {
    login: (credentials) =>
      payload.login({
        collection: 'users',
        data: credentials as { email: string; password: string },
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
