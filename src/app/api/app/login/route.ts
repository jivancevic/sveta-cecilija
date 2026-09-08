import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { generatePayloadCookie } from 'payload/shared'
import config from '@payload-config'
import { handleAppLogin } from '@/lib/app/login'
import { appRequestMeta } from '@/lib/app/request-guard'

// POST /api/app/login — the Moreškant app's own sign-in (#421, ADR-0023).
//
// `/app` shares Payload's session but never `/admin/login`: this route runs the
// local `login` operation and sets the very cookie Payload's admin sets, built
// by Payload's own `generatePayloadCookie` from the Users auth config (30-day
// expiry, httpOnly, path `/`, SameSite). No `Secure` flag: `cookies.secure` is
// unset on the Users collection, so this matches what `/admin` sets, and the
// site is HTTPS-only in production anyway. The decisions — which field the
// identifier is, which status code, what the message says — live in
// `src/lib/app/login.ts` and are unit-tested there, the cross-site refusal in
// `src/lib/app/request-guard.ts`.
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
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    login: (credentials) =>
      payload.login({
        collection: 'users',
        // Payload types `data` from the generated `payload-types.ts`, which this
        // repo does not commit, so at typecheck time it narrows to the email
        // pair. The operation itself takes a username too (loginWithUsername,
        // ADR-0011) and `credentials` is exactly one of the two — which is what
        // this widening says out loud, unlike a cast that would claim the
        // username branch is an email.
        data: credentials as Parameters<typeof payload.login>[0]['data'],
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
