// Signing in from a link (#463).
//
// The invitation and "Pošalji mi link za prijavu" both hand a dancer a URL that
// carries a Payload reset token. Until #463 that link led to a form asking for
// a password; now it opens the session itself and the password is something a
// dancer may set later in Više, or never.
//
// Four rules keep that narrow, and they are here rather than in the route
// because each of them is a table row in token-login.test.ts:
//
//  1. the `/app` cross-site guard, as on every other cookie-setting POST;
//  2. a token that is unknown, expired or spent is ONE sentence, because for
//     the person holding the link they are one situation: ask for a new one;
//  3. a `shared` login (ADR-0022) may not be opened this way. A login several
//     volunteers hold has no inbox of its own, so a link that signs its holder
//     in is a link that signs anybody in;
//  4. only an account that belongs in `/app` — `moreskant` or `moreska` —
//     signs in here. A `tickets` or `door` account resets its password in
//     `/admin`, and this route is not a second door into the backoffice.
//
// **The token is not spent on use**, deliberately, and that is the one decision
// here worth arguing with. It lives its natural life instead (seven days from
// an invitation, one hour from a sign-in link) and a second tap works as well
// as the first. Single use reads safer and is wrong for this audience: the
// invitation arrives as an SMS, a dancer opens it in whatever browser their
// phone hands them, and half the failures #455 exists to fix end with "open
// this in Safari instead" — which is a SECOND tap on the same link. Burning the
// token on the first tap would turn the app's most common recovery into a dead
// end. The link is as sensitive as the SMS thread it sits in, for as long as it
// lives, and that is the trade being made.

import { hasAny, type PermissionUser } from '@/lib/access/permissions'
import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'

/** The account a token resolved to, as the rules read it. */
export interface TokenLoginUser {
  id: string | number
  permissions?: readonly unknown[] | null
  shared?: unknown
}

export interface TokenLoginResult {
  status: number
  body: { ok: true } | { error: string }
  /** The session cookie, on success only. */
  setCookie?: string
}

export interface TokenLoginDeps {
  request: AppRequestMeta
  /** The live-token lookup (`findUserByResetToken`); null for unknown or expired. */
  findUserByToken: (token: string) => Promise<TokenLoginUser | null>
  /** Mints the session and returns the `Set-Cookie` value (`openAppSession`). */
  openSession: (userId: string | number) => Promise<string>
}

/** Does this login belong in `/app` at all? */
export function mayOpenAppSession(user: TokenLoginUser | null | undefined): boolean {
  if (!user) return false
  return hasAny(user as PermissionUser, ['moreskant', 'moreska'])
}

/**
 * POST /api/app/session `{ token }`.
 *
 * 403/415 cross-site or non-JSON, 400 for a missing or dead token, 403 for a
 * shared login, 400 for an account that has no `/app`, 200 + the session cookie
 * otherwise.
 */
export async function handleTokenLogin(
  input: { token?: unknown } | null | undefined,
  deps: TokenLoginDeps,
): Promise<TokenLoginResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.signIn.unexpected } }

  const token = typeof input?.token === 'string' ? input.token.trim() : ''
  if (!token) return { status: 400, body: { error: APP_STRINGS.signIn.invalidToken } }

  let user: TokenLoginUser | null = null
  try {
    user = await deps.findUserByToken(token)
  } catch {
    // An unreadable lookup must not read as "no such token", which is a
    // sentence telling the dancer to ask for a new link that would fail too.
    return { status: 500, body: { error: APP_STRINGS.signIn.unexpected } }
  }
  if (!user) return { status: 400, body: { error: APP_STRINGS.signIn.invalidToken } }

  if (user.shared === true) return { status: 403, body: { error: APP_STRINGS.signIn.sharedAccount } }
  if (!mayOpenAppSession(user)) {
    return { status: 403, body: { error: APP_STRINGS.signIn.notAppAccount } }
  }

  let cookie: string
  try {
    cookie = await deps.openSession(user.id)
  } catch {
    return { status: 500, body: { error: APP_STRINGS.signIn.unexpected } }
  }

  return { status: 200, body: { ok: true }, setCookie: cookie }
}
