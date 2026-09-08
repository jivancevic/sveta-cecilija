// `/app` sign-in and sign-out (#421, ADR-0023).
//
// `/app` shares Payload's session: the route handlers below run Payload's local
// `login` and set the SAME `payload-token` cookie the admin sets (built by
// Payload's own `generatePayloadCookie`, so httpOnly, path, SameSite, Secure and
// the expiry all follow the collection's auth config — 30 days, ADR-0011).
// A dancer never sees `/admin/login`.
//
// Login deliberately does NOT check permissions. Any valid account may sign in;
// what it may then *see* is the `/app` access decision (./access.ts), so a door
// login lands on the Croatian "nemate pristup" page instead of an error that
// looks like a wrong password (#419, story 37).
//
// Pure + DI so the status codes, the identifier rule and the cookie handling are
// tested without Payload or a socket — the `route-guard.test.ts` pattern. The
// route files are only the wiring.

import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'

/** What the login form posts. */
export interface AppLoginInput {
  /** Email or username: whichever the dancer remembers (ADR-0011 hybrid login). */
  identifier?: unknown
  password?: unknown
}

export interface AppAuthResult {
  status: number
  body: { ok: true } | { error: string }
  /** A `Set-Cookie` value, when the response changes the session. */
  setCookie?: string
}

/** The cross-site check both handlers run before they touch a session. */
export interface AppRequestGuarded {
  /** Origin / Sec-Fetch-Site / Content-Type, plus the origins we own. */
  request: AppRequestMeta
}

/**
 * Exactly one identifier, never both: Payload's `loginWithUsername` refuses an
 * email in the username field and vice versa (ADR-0011).
 */
export type AppLoginCredentials =
  | { email: string; password: string }
  | { username: string; password: string }

export interface AppLoginDeps extends AppRequestGuarded {
  /**
   * Payload's local `login`, narrowed to what this route passes. Resolves with
   * a token on success; throws (or resolves tokenless) on bad credentials.
   */
  login: (credentials: AppLoginCredentials) => Promise<{
    token?: string | null
  }>
  /** Payload's `generatePayloadCookie` for the users collection. */
  cookie: (token: string) => string
}

export interface AppLogoutDeps extends AppRequestGuarded {
  /** Payload's `generateExpiredPayloadCookie` for the users collection. */
  expiredCookie: () => string
  /**
   * Removes the session behind the request from `users.sessions` (Payload's
   * `logoutOperation`). Clearing the cookie alone leaves the JWT valid for its
   * full 30 days, so anyone holding a copy stays signed in.
   */
  invalidateSession: () => Promise<void>
}

/**
 * A cross-site or non-JSON POST, refused before any session work. The body
 * carries the generic Croatian "not possible right now" line: a real user never
 * sees it (their browser sends our own Origin) and an attacker learns nothing.
 */
function guard(deps: AppRequestGuarded): AppAuthResult | null {
  const rejection = rejectAppRequest(deps.request)
  if (!rejection) return null
  return { status: rejection.status, body: { error: APP_STRINGS.login.unexpected } }
}

/**
 * Which login field a typed identifier is. An `@` means an email address;
 * anything else is a username (`tehnika`, `cici`, `admin`). Payload's
 * `loginWithUsername` refuses an email in the username field and vice versa, so
 * the choice has to be made before the call.
 */
export function identifierField(identifier: string): 'email' | 'username' {
  return identifier.includes('@') ? 'email' : 'username'
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * POST /api/app/login.
 *
 * 403/415 when the request is cross-site or not JSON (see ./request-guard.ts),
 * 400 with a Croatian message when a field is missing, 401 when the credentials
 * are wrong, 200 + the session cookie when they are right. The 401 message never
 * says which half was wrong — an account-enumeration hint on a public URL.
 */
export async function handleAppLogin(
  input: AppLoginInput | null | undefined,
  deps: AppLoginDeps,
): Promise<AppAuthResult> {
  const rejected = guard(deps)
  if (rejected) return rejected

  const identifier = str(input?.identifier)
  // A password is used verbatim; only its presence is checked.
  const password = typeof input?.password === 'string' ? input.password : ''

  if (!identifier || !password) {
    return { status: 400, body: { error: APP_STRINGS.login.missingFields } }
  }

  let token: string | null | undefined
  try {
    const credentials: AppLoginCredentials =
      identifierField(identifier) === 'email'
        ? { email: identifier, password }
        : { username: identifier, password }
    const result = await deps.login(credentials)
    token = result?.token
  } catch {
    return { status: 401, body: { error: APP_STRINGS.login.failed } }
  }

  if (!token) {
    return { status: 401, body: { error: APP_STRINGS.login.failed } }
  }

  return { status: 200, body: { ok: true }, setCookie: deps.cookie(token) }
}

/**
 * POST /api/app/logout — invalidates the session, then clears the cookie.
 *
 * The order matters and so does the swallow: the session row is what actually
 * ends the login (the cookie is only the browser's copy of a JWT that stays
 * valid for 30 days), but a failure to write it must not leave the dancer with
 * a cookie they cannot drop. Always 200: signing out of a session that is
 * already gone is a success, not an error.
 */
export async function handleAppLogout(deps: AppLogoutDeps): Promise<AppAuthResult> {
  const rejected = guard(deps)
  if (rejected) return rejected

  try {
    await deps.invalidateSession()
  } catch {
    // No session, or Payload refused: the cookie still goes.
  }
  return { status: 200, body: { ok: true }, setCookie: deps.expiredCookie() }
}
