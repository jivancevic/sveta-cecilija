// "Zaboravljena lozinka" (#424, #419 story 23).
//
// A dancer who lost their password types an email or a username and gets a
// link to the same `/app/session?token=` page the invitation uses, valid for one
// hour rather than seven days: an invitation is a thing a voditelj hands over
// and a dancer opens when they get to it, a reset is a thing the dancer just
// asked for.
//
// **One answer, always 200.** "There is no such account" and "the link is on
// its way" read identically, because this URL is public and the difference
// between the two answers is a list of who has a login. The same silence covers
// an account without an email (the shared `tehnika` door login, a partner POS):
// there is nowhere to send it, and saying so would confirm the account exists.
//
// Pure + DI, tested in forgot.test.ts; the route is wiring.

import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import { identifierField } from './login'
import { isUsableBaseUrl, signInLink } from './invite'

/** One hour, the life of a self-service reset link. */
export const RESET_EXPIRATION_MS = 60 * 60 * 1000

/** The account the identifier resolved to, or null. */
export interface ForgotAccount {
  id: string | number
  username?: string | null
  email?: string | null
  name?: string | null
}

export interface ForgotResult {
  status: number
  body: { ok: true; message: string } | { error: string }
}

export interface ForgotDeps {
  request: AppRequestMeta
  baseUrl: string
  /**
   * False when this caller has spent their window
   * (`src/lib/rate-limit/forgot-rate-limit.ts`). A blocked request gets the
   * same 200 sentence as everything else and costs no token and no mail.
   */
  allow: (identifier: string) => boolean
  /** One `find` on users over `email` OR `username`; null when nothing matches. */
  findAccount: (identifier: { email?: string; username?: string }) => Promise<ForgotAccount | null>
  /** Payload's `forgotPassword`, email disabled; resolves with the token. */
  issueResetToken: (
    target: { username?: string; email?: string },
    expirationMs: number,
  ) => Promise<string | null>
  /** Sends the Croatian reset mail through the shared Brevo poster. */
  sendReset: (mail: { to: string; greeting: string; link: string }) => Promise<void>
}

/**
 * POST /api/app/forgot `{ identifier }`.
 *
 * 403/415 cross-site or non-JSON, 400 only when the field is empty (that is the
 * user's own typing, not a fact about any account), 200 with one sentence in
 * every other case: found, not found, or found without an email.
 */
export async function handleForgot(
  input: { identifier?: unknown } | null | undefined,
  deps: ForgotDeps,
): Promise<ForgotResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.forgot.unexpected } }

  // A link that is not absolute is a link nobody can open, and a mail carrying
  // one is worse than no mail: it burns the token and reads as a broken system.
  // Configuration, not user input, so it fails loudly and identically for
  // everyone (it cannot say anything about who exists).
  if (!isUsableBaseUrl(deps.baseUrl)) {
    console.error('[handleForgot] NEXT_PUBLIC_BASE_URL is missing or relative; no mail sent')
    return { status: 500, body: { error: APP_STRINGS.forgot.unexpected } }
  }

  const identifier = typeof input?.identifier === 'string' ? input.identifier.trim() : ''
  if (!identifier) return { status: 400, body: { error: APP_STRINGS.forgot.missing } }

  const sent: ForgotResult = { status: 200, body: { ok: true, message: APP_STRINGS.forgot.sent } }

  // Throttled: the same sentence, no lookup, no token, no mail.
  if (!deps.allow(identifier)) return sent

  // Email or username, the same fork the login form makes (ADR-0011).
  const lookup =
    identifierField(identifier) === 'email'
      ? { email: identifier.toLowerCase() }
      : { username: identifier.toLowerCase() }

  let account: ForgotAccount | null = null
  try {
    account = await deps.findAccount(lookup)
  } catch {
    account = null
  }
  if (!account) return sent

  const email = typeof account.email === 'string' ? account.email.trim() : ''
  // Nowhere to send it: a username-only account (door, partner, season_stats)
  // recovers through a `users` holder, not through this form.
  if (!email) return sent

  const username = typeof account.username === 'string' && account.username ? account.username : ''
  let token: string | null = null
  try {
    token = await deps.issueResetToken(username ? { username } : { email }, RESET_EXPIRATION_MS)
  } catch {
    token = null
  }
  if (!token) return sent

  // Fire and forget, deliberately. Awaiting the Brevo round-trip would make a
  // hit measurably slower than a miss, and a stopwatch is all an attacker needs
  // to turn one sentence into two answers. Nothing downstream depends on the
  // result: a failed send is logged by the sender and the caller is told the
  // same thing either way.
  void deps
    .sendReset({
      to: email,
      greeting: typeof account.name === 'string' ? account.name.trim() : '',
      link: signInLink(deps.baseUrl, token),
    })
    .catch((err) => {
      console.error('[handleForgot] reset mail failed:', err instanceof Error ? err.message : err)
    })

  return sent
}
