import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { handleTokenLogin } from '@/lib/app/token-login'
import { appRequestMeta } from '@/lib/app/request-guard'
import { findUserByResetToken, openAppSession } from '@/lib/app/session-data'

// POST /api/app/session — signing in from a link (#463).
//
// Wiring only; the four rules are in `src/lib/app/token-login.ts` and the
// Payload half (the token lookup and the session) in
// `src/lib/app/session-data.ts`.
//
// Unauthenticated by nature: the token IS the authentication, exactly as on
// `/api/app/login`, so it carries the `/app` cross-site guard rather than
// `requirePermission`.
//
// **It is a POST, and that is not cosmetic.** The link the dancer taps is a GET
// on `/app/session?token=…`, which does nothing but render; the session is
// opened by this POST, fired from that page's JavaScript. Mail providers,
// link-preview bots and security scanners fetch a URL they find in a letter —
// they do not run a page's scripts and post JSON back to it behind a
// `Sec-Fetch-Site` check. If signing in lived on the GET, an invitation could
// be spent by a scanner before its owner ever saw it.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const payload = await getPayload({ config })
  const body = await req.json().catch(() => null)

  const result = await handleTokenLogin(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    findUserByToken: (token) => findUserByResetToken(payload, token),
    openSession: (userId) => openAppSession(payload, userId),
  })

  const response = NextResponse.json(result.body, { status: result.status })
  if (result.setCookie) response.headers.set('Set-Cookie', result.setCookie)
  return response
}
