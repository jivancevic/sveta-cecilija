// The session that slides (#650, ADR-0028 decision 1).
//
// `Users.auth.tokenExpiration` is thirty days and nothing under `/app` ever
// re-minted the cookie, so a dancer who signed in on 10 September was signed
// out around 10 October however often they opened the app in between. That is
// only an inconvenience for staff, who have an address and a password; for the
// roster it is a dead end, because **one moreškant out of seventy-six has an
// e-mail** (`invite.ts`) and the rest can only get back in by texting the
// voditelj.
//
// So the cookie is re-issued while the dancer is still using the app. The rule
// is deliberately NOT "refresh on every load":
//
//   - a `Set-Cookie` on every page load is a write to `users.sessions` on every
//     page load (`addSessionToUser` rewrites the row), a dozen times a day per
//     device, for no gain the dancer can feel;
//   - seven days is a week of not opening the app before anything changes, and
//     renewing a week-old cookie already gives the weekly user a session that
//     never ends. The dancer who has been away thirty-one days still falls out,
//     which is right: that person needs a fresh way in anyway.
//
// Everything here is pure and table-tested (`session-renewal.test.ts`). The
// wiring — who asks, and what mints the new cookie — is
// `session-renewal-data.ts`, `src/app/app/SessionKeeper.tsx` and
// `POST /api/app/session/renew`. The MINTING itself is `openAppSession`,
// unchanged: renewal is the same four Payload helpers a sign-in link uses,
// never a second crypto decision.

/** A session cookie older than this is re-issued; a fresher one is left alone. */
export const SESSION_RENEW_AFTER_MS = 7 * 24 * 60 * 60 * 1000

function toMillis(value: Date | number | null | undefined): number | null {
  if (value == null) return null
  const ms = value instanceof Date ? value.getTime() : value
  return Number.isFinite(ms) ? ms : null
}

/**
 * Is this session old enough to be worth re-issuing?
 *
 * Three refusals, each of them a row in the table:
 *
 *  - **no `issuedAt`** (an unreadable or `iat`-less token) → false. A token
 *    whose age cannot be established is never renewed blindly; the worst case
 *    is the session Cecilija has always had.
 *  - **issued in the future** → false. A phone with a skewed clock, or a
 *    server one, must not turn into a renewal on every single load.
 *  - **exactly seven days old** → false. "Older than seven days" is a strict
 *    comparison, so the boundary renews on the next request rather than this one.
 */
export function shouldRenewSession(
  issuedAt: Date | number | null | undefined,
  now: Date | number,
): boolean {
  const issued = toMillis(issuedAt)
  const nowMs = toMillis(now)
  if (issued === null || nowMs === null) return false
  const age = nowMs - issued
  if (age < 0) return false
  return age > SESSION_RENEW_AFTER_MS
}

/** Payload's own cookie name (`generatePayloadCookie`), never re-spelled. */
export function appSessionCookieName(cookiePrefix: string | null | undefined): string {
  const prefix = typeof cookiePrefix === 'string' && cookiePrefix !== '' ? cookiePrefix : 'payload'
  return `${prefix}-token`
}

/** The session token out of a raw `Cookie:` header, or null. */
export function sessionTokenFromCookieHeader(
  header: string | null | undefined,
  cookiePrefix: string | null | undefined,
): string | null {
  if (!header) return null
  const name = appSessionCookieName(cookiePrefix)
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=')
    if (at === -1) continue
    if (pair.slice(0, at).trim() !== name) continue
    const value = pair.slice(at + 1).trim()
    return value === '' ? null : value
  }
  return null
}

function decodeBase64Url(segment: string): string | null {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  } catch {
    return null
  }
}

/**
 * When was this JWT issued, as its own `iat` claim says?
 *
 * Read WITHOUT verifying the signature, on purpose. Nothing is granted on the
 * strength of this number: it only decides whether to bother asking the renewal
 * route, and that route authenticates the caller properly (`requireAppSession`)
 * and applies the same rule again before it mints anything. Verifying here would
 * mean a second place that knows `payload.secret`.
 */
export function readTokenIssuedAt(token: string | null | undefined): Date | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const json = decodeBase64Url(parts[1] ?? '')
  if (json === null) return null
  let claims: unknown
  try {
    claims = JSON.parse(json)
  } catch {
    return null
  }
  const iat = (claims as { iat?: unknown } | null)?.iat
  // `iat` is seconds since the epoch (jose's `setIssuedAt`), not milliseconds.
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return null
  return new Date(iat * 1000)
}

/** The whole decision off a request's own `Cookie` header. */
export function decideSessionRenewal(input: {
  cookieHeader: string | null | undefined
  cookiePrefix: string | null | undefined
  now: Date | number
}): boolean {
  const token = sessionTokenFromCookieHeader(input.cookieHeader, input.cookiePrefix)
  return shouldRenewSession(readTokenIssuedAt(token), input.now)
}
