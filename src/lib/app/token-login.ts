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
//  4. only an account that belongs in Cecilija signs in here, and "belongs" is
//     the shell's own rule (#495): the permission set unlocks at least one
//     screen. It named `moreskant` and `moreska` until #510, back when a link
//     could only ever be a dancer's invitation and the backoffice was where
//     staff set a password. Korisnici now mints this same link for a new
//     `tickets`, `finance` or `users` login, so a hard-coded pair of words
//     would have refused the account it had just opened.
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

import type { PermissionUser } from '@/lib/access/permissions'
import { unlockedScreens } from './screens'
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

/**
 * Does this login belong in Cecilija at all?
 *
 * The shell's rule, read off the one screen table: a set that unlocks nothing
 * has nowhere to land, so the link says so rather than opening a session onto
 * the "Nemate pristup" panel. `refunds`, `dev` and `editor` are the sets that
 * fail it today — a refund is an action inside an order, `dev` is a diagnostics
 * strip, and Objave and FAQ live in the Backoffice.
 *
 * **The two conditional permissions are read optimistically** (`hasMember`,
 * `hasPartner` both true), because this handler holds a token and not a Member
 * row: whether a dancer's Member is still active, or a reseller's Partner link
 * still resolves, is the PAGE gate's question and it re-reads both with
 * `overrideAccess` on every request (`decideAppAccess`). Signing in is not the
 * access decision — `/api/app/login` checks no permission either, and the two
 * doors have to agree or a password and a link would admit different people.
 */
export function mayOpenAppSession(user: TokenLoginUser | null | undefined): boolean {
  if (!user) return false
  return (
    unlockedScreens(user as PermissionUser, { hasMember: true, hasPartner: true }).length > 0
  )
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
