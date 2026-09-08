// Choosing a password from an invitation or a reset link (#424).
//
// The link in both mails points at `/app/set-password?token=…`; this is what
// the form behind it posts to. It runs Payload's `resetPassword`, which both
// stores the new hash and opens a session, so the dancer lands on `/app`
// already signed in rather than on a login form asking for the password they
// typed two seconds ago.
//
// It is an unauthenticated, cookie-SETTING POST, the same shape as the login
// route, so it carries the same cross-site guard (./request-guard.ts).
//
// Pure + DI: the four refusals and the cookie are decided here and tested in
// set-password.test.ts; `src/app/api/app/set-password/route.ts` is the wiring.

import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'

/**
 * The shortest password `/app` accepts.
 *
 * The Users collection sets no minimum (Payload enforces only "not empty"), so
 * the rule has to live somewhere; eight characters is the floor the invitation
 * flow puts on a dancer's own choice. It is deliberately not a complexity rule:
 * a phone keyboard and a required symbol produce written-down passwords.
 */
export const MIN_PASSWORD_LENGTH = 8

export interface SetPasswordInput {
  token?: unknown
  password?: unknown
  repeat?: unknown
}

export interface SetPasswordResult {
  status: number
  body: { ok: true } | { error: string }
  setCookie?: string
}

export interface SetPasswordDeps {
  request: AppRequestMeta
  /**
   * Payload's local `resetPassword` (`data: { token, password }`,
   * `overrideAccess: true`). Resolves with a session token; throws a 403
   * "Token is either invalid or has expired" when the token does not match a
   * live row.
   */
  resetPassword: (data: { token: string; password: string }) => Promise<{ token?: string | null }>
  /** Payload's `generatePayloadCookie` for the users collection. */
  cookie: (token: string) => string
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * POST /api/app/set-password.
 *
 * 403/415 cross-site or non-JSON, 400 for a missing token, a short password, a
 * mismatched repeat or a token Payload refuses, 200 + the session cookie on
 * success. Every failure answers with the same Croatian sentence a bad link
 * would produce, because "expired" and "already used" are the same situation
 * for the dancer: ask for a new one.
 */
export async function handleSetPassword(
  input: SetPasswordInput | null | undefined,
  deps: SetPasswordDeps,
): Promise<SetPasswordResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.setPassword.unexpected } }

  const token = str(input?.token).trim()
  if (!token) return { status: 400, body: { error: APP_STRINGS.setPassword.missingToken } }

  // A password is used verbatim, spaces included: only its length is judged.
  const password = str(input?.password)
  const repeat = str(input?.repeat)
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { status: 400, body: { error: APP_STRINGS.setPassword.tooShort } }
  }
  if (password !== repeat) {
    return { status: 400, body: { error: APP_STRINGS.setPassword.mismatch } }
  }

  let session: string | null | undefined
  try {
    const result = await deps.resetPassword({ token, password })
    session = result?.token
  } catch {
    return { status: 400, body: { error: APP_STRINGS.setPassword.invalidToken } }
  }
  if (!session) return { status: 400, body: { error: APP_STRINGS.setPassword.invalidToken } }

  return { status: 200, body: { ok: true }, setCookie: deps.cookie(session) }
}
