import { NextResponse } from 'next/server'
import { requestIsHttps } from '@/lib/app/http'
import { appRequestMeta, rejectAppRequest } from '@/lib/app/request-guard'
import {
  deviceCookie,
  deviceIdFromCookieHeader,
  newDeviceId,
  recordsOutOfTurn,
  shouldRecordDevice,
} from '@/lib/app/device'
import { loadDeviceState, recordDevice } from '@/lib/app/device-store'
import { poolQuery } from '@/lib/db/pool-query'
import { openAppSession } from '@/lib/app/session-data'
import { requireAppSession } from '@/lib/app/session-guard'
import { decideSessionRenewal } from '@/lib/app/session-renewal'

// POST /api/app/session/renew — the `/app` keeper (#650, #652).
//
// One background call with two jobs, both of them decided on the server before
// the browser is asked for anything (`appKeeperWork`, mounted by the `(shell)`
// layout):
//
//  1. **The sliding session** (ADR-0028 decision 1): a cookie older than seven
//     days is re-issued for another thirty, so a dancer who opens the app at
//     all never falls out.
//  2. **The device heartbeat** (#652): the browser says whether it is running
//     as an installed app, and `app_devices` remembers it, at most once per six
//     hours per device. It rides this route rather than a second one because
//     the seam is the same seam and a second POST on the same load would be a
//     second round trip for a statistic.
//
// Its audience is an ACCOUNT, not a permission: a session belongs to whoever
// holds it, and every account Cecilija admits has one, device included. So it
// carries `requireAppSession` (the same guard as #496's inbox routes, composing
// Payload's `auth` with the page gate's own `decideAppAccess`) rather than
// `requirePermission` — still an in-handler re-check, because the local API
// runs `overrideAccess: true`. It also carries the `/app` cross-site guard, as
// every cookie-setting POST under `/app` does.
//
// **Both age rules are applied again here**, against the request's own cookies,
// and not because the caller is distrusted: the caller is a script this app
// rendered. They are applied here because this is the handler that WRITES, and
// a route that renews or records whatever it is asked to is one stuck retry
// away from rewriting `users.sessions` and `app_devices` on every page load.
//
// **The old session is deliberately NOT revoked.** `addSessionToUser` keeps
// every other `sid` (and prunes the expired ones), so this signs no other
// device out; revoking the sid this very request arrived on would mean a
// dropped response — a tunnel, a backgrounded phone — signs the dancer out
// instead of extending them. The superseded sid dies of its own expiry.
//
// **The device write never fails the request.** A dancer's session is the point
// of this route; a statistic about their browser is not, and an unreachable
// `app_devices` must not cost anybody their cookie.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rejection = rejectAppRequest(appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL))
  if (rejection) return NextResponse.json({ error: rejection.reason }, { status: rejection.status })

  const gate = await requireAppSession(req)
  if (gate.error) return gate.error

  const now = new Date()
  const body = (await req.json().catch(() => null)) as { standalone?: unknown } | null

  const renewDue = decideSessionRenewal({
    cookieHeader: req.headers.get('cookie'),
    cookiePrefix: gate.payload.config.cookiePrefix,
    now,
  })

  const cookies: string[] = []

  if (renewDue) cookies.push(await openAppSession(gate.payload, gate.userId))

  // A device report is a report the page ASKED to send: the client only puts
  // `standalone` in the body when the layout decided the heartbeat was due.
  // Anything else in that field is not a browser answer and is ignored.
  const devicePart = await maybeRecordDevice(req, gate, body, now)
  if (devicePart) cookies.push(devicePart)

  const response = NextResponse.json({ ok: true, renewed: renewDue, device: devicePart !== null })
  for (const cookie of cookies) response.headers.append('Set-Cookie', cookie)
  return response
}

/**
 * Write this browser down, and hand back the `Set-Cookie` that names it.
 *
 * Returns null whenever there is nothing to do: no report in the body, a device
 * seen within the last six hours, or a failure — which is logged and swallowed,
 * because the session half of this response matters and this half does not.
 */
async function maybeRecordDevice(
  req: Request,
  gate: { payload: unknown; userId: string },
  body: { standalone?: unknown } | null,
  now: Date,
): Promise<string | null> {
  if (typeof body?.standalone !== 'boolean') return null

  try {
    const query = poolQuery(gate.payload)
    const existing = deviceIdFromCookieHeader(req.headers.get('cookie'))
    // A browser with no cookie is one this app has never named, so `null` here
    // means "never seen" and the throttle says yes on the spot.
    const onRecord = existing ? await loadDeviceState(query, existing) : null
    // Two reasons to write, and the second is #669's: the throttle has run out,
    // OR this browser has just said it is an installed app for the first time.
    // A voditelj checking whether an instruction landed should not be reading a
    // six-hour-old answer.
    const due =
      shouldRecordDevice(onRecord?.lastSeenAt ?? null, now) ||
      recordsOutOfTurn({ standalone: body.standalone }, onRecord)
    if (!due) return null

    const deviceId = existing ?? newDeviceId()
    await recordDevice(query, {
      deviceId,
      userId: gate.userId,
      standalone: body.standalone,
      userAgent: req.headers.get('user-agent'),
    })
    // Re-sent on every write, so the year rolls forward for a browser that
    // keeps being used rather than expiring on the anniversary of its first load.
    return deviceCookie(deviceId, { secure: requestIsHttps(req) })
  } catch (err) {
    console.error('[app] device heartbeat failed', err)
    return null
  }
}
