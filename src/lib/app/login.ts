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

export interface AppLoginDeps {
  /**
   * Payload's local `login`, narrowed to what this route passes. Resolves with
   * a token on success; throws (or resolves tokenless) on bad credentials.
   */
  login: (credentials: { email?: string; username?: string; password: string }) => Promise<{
    token?: string | null
  }>
  /** Payload's `generatePayloadCookie` for the users collection. */
  cookie: (token: string) => string
}

export interface AppLogoutDeps {
  /** Payload's `generateExpiredPayloadCookie` for the users collection. */
  expiredCookie: () => string
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
 * 400 with a Croatian message when a field is missing, 401 when the credentials
 * are wrong, 200 + the session cookie when they are right. The 401 message never
 * says which half was wrong — an account-enumeration hint on a public URL.
 */
export async function handleAppLogin(
  input: AppLoginInput | null | undefined,
  deps: AppLoginDeps,
): Promise<AppAuthResult> {
  const identifier = str(input?.identifier)
  // A password is used verbatim; only its presence is checked.
  const password = typeof input?.password === 'string' ? input.password : ''

  if (!identifier || !password) {
    return { status: 400, body: { error: APP_STRINGS.login.missingFields } }
  }

  let token: string | null | undefined
  try {
    const result = await deps.login({
      [identifierField(identifier)]: identifier,
      password,
    })
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
 * POST /api/app/logout — clears the shared session cookie. Always 200: signing
 * out of a session that is already gone is a success, not an error.
 */
export function handleAppLogout(deps: AppLogoutDeps): AppAuthResult {
  return { status: 200, body: { ok: true }, setCookie: deps.expiredCookie() }
}
