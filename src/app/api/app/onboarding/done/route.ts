import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { onboardingCookie } from '@/lib/app/onboarding'
import { appRequestMeta, rejectAppRequest } from '@/lib/app/request-guard'

// POST /api/app/onboarding/done — this device has seen the Dobrodošlica (#457).
//
// The one thing it does is set a cookie, and that is exactly why it exists: a
// `document.cookie` write lives seven days under Safari's ITP, so the "once per
// phone, per season" promise has to come from a `Set-Cookie` header. The value
// itself is built in `src/lib/app/onboarding.ts`, beside the rule that reads it.
//
// Guarded like the other `/app` POSTs even though it moves nothing: the
// cross-site check first (a foreign `Origin` → 403, a non-JSON body → 415,
// refused before any session work), then `requirePermission` — the chokepoint
// every staff route uses, CLAUDE.md hard rule — which answers 401 for an
// anonymous caller and 403 for a `tickets`, `door` or `partner` login that has
// no `/app` to be welcomed to. A cookie handed to a signed-out browser would be
// a walkthrough silently skipped for whoever signs in on that phone next.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The scheme the browser actually used, as the reverse proxy reports it. */
function isHttps(req: Request): boolean {
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (forwarded) return forwarded.toLowerCase() === 'https'
  try {
    return new URL(req.url).protocol === 'https:'
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const rejection = rejectAppRequest(appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL))
  if (rejection) {
    // HTTP-level, like the guard's own 401/403 bodies: no screen ever reads
    // this one, since the client fires the call and ignores what comes back.
    return NextResponse.json({ error: rejection.reason }, { status: rejection.status })
  }

  const gate = await requirePermission(req, ['moreskant', 'moreska'])
  if (gate.error) return gate.error

  const response = new NextResponse(null, { status: 204 })
  response.headers.set('Set-Cookie', onboardingCookie({ secure: isHttps(req) }))
  return response
}
