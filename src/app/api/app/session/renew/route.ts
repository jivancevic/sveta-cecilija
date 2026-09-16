import { NextResponse } from 'next/server'
import { appRequestMeta, rejectAppRequest } from '@/lib/app/request-guard'
import { openAppSession } from '@/lib/app/session-data'
import { requireAppSession } from '@/lib/app/session-guard'
import { decideSessionRenewal } from '@/lib/app/session-renewal'

// POST /api/app/session/renew — the sliding session (#650, ADR-0028 decision 1).
//
// Its audience is an ACCOUNT, not a permission: a session belongs to whoever
// holds it, and every account Cecilija admits has one. So it carries
// `requireAppSession` (the same guard as #496's inbox routes, composing
// Payload's `auth` with the page gate's own `decideAppAccess`) rather than
// `requirePermission` — still an in-handler re-check, because the local API
// runs `overrideAccess: true`. It also carries the `/app` cross-site guard, as
// every cookie-setting POST under `/app` does.
//
// **The age rule is applied again here**, against the request's own cookie, and
// not because the caller is distrusted: the caller is a script this app
// rendered. It is applied here because this is the handler that WRITES, and a
// route that renews whatever it is asked to renew is one stuck retry away from
// rewriting `users.sessions` on every page load.
//
// **The old session is deliberately NOT revoked.** `addSessionToUser` keeps
// every other `sid` (and prunes the expired ones), so this signs no other
// device out; revoking the sid this very request arrived on would mean a
// dropped response — a tunnel, a backgrounded phone — signs the dancer out
// instead of extending them. The superseded sid dies of its own expiry.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rejection = rejectAppRequest(appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL))
  if (rejection) return NextResponse.json({ error: rejection.reason }, { status: rejection.status })

  const gate = await requireAppSession(req)
  if (gate.error) return gate.error

  const due = decideSessionRenewal({
    cookieHeader: req.headers.get('cookie'),
    cookiePrefix: gate.payload.config.cookiePrefix,
    now: new Date(),
  })
  if (!due) return NextResponse.json({ ok: true, renewed: false })

  const cookie = await openAppSession(gate.payload, gate.userId)
  const response = NextResponse.json({ ok: true, renewed: true })
  response.headers.set('Set-Cookie', cookie)
  return response
}
