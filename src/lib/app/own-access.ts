// A moreškant's own e-mail and password (#651, ADR-0028).
//
// This replaces `set-password.ts`, which was the same act with half the task in
// it: since #463 an invitation LINK signed a dancer in, and the password form
// was an extra a dancer could take or leave. Living with that through a season
// showed what it does not cover — a session that expires, a second phone, a
// "Zaboravljena lozinka" with nowhere to send anything — and all three are the
// same missing thing, which is an ADDRESS the dancer owns. So the two fields
// are one task and one route: a password with no address cannot be recovered,
// an address with no password cannot sign anybody in.
//
// **The route is the lock.** `Users.email` is NOT field-locked (a person may
// carry their own address), and every `/app` write runs the local API with
// `overrideAccess: true`, so collection access gates nothing here (CLAUDE.md
// hard rule). Everything that keeps this narrow is therefore in this file:
//
//  1. the caller holds `moreskant` or `moreska` (the ROUTE's job, first);
//  2. the row written is the SESSION's own id, never one off the body — a body
//     that names any other account is refused rather than ignored, so a caller
//     who tried learns that it did not land (#462's link-self is the nearest
//     precedent; this is narrower, because that one at least chose a Member);
//  3. `name`, `note`, `permissions`, `member`, `shared`, `tabs` and `username`
//     are refused outright. Those are Korisnici's, and #510's six routes are
//     their only writer;
//  4. a shared login may not touch either field (ADR-0022): several people hold
//     `tehnika`, so "my address" has no answer and one of them rotating the
//     password locks out the rest.
//
// Pure + DI like every other `/app` handler: no Payload, no fetch, so each rule
// is a row in own-access.test.ts rather than a browser click.

import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'

const S = APP_STRINGS.ownAccess

/**
 * The shortest password `/app` accepts.
 *
 * The Users collection sets no minimum (Payload enforces only "not empty"), so
 * the rule has to live somewhere; eight characters is the floor `/app` puts on
 * a dancer's own choice. Deliberately not a complexity rule: a phone keyboard
 * and a required symbol produce written-down passwords.
 */
export const MIN_PASSWORD_LENGTH = 8

/**
 * What a dancer may never send here, each one somebody else's to write.
 *
 * `email` and `password` are the only two keys this route knows; the rest are
 * named so the refusal can be a 403 with a sentence rather than a silent drop.
 */
export const LOCKED_KEYS = [
  'name',
  'note',
  'permissions',
  'member',
  'shared',
  'tabs',
  'username',
  // Not somebody else's, but nobody's: the stamp is written by this handler
  // from its own clock, and a caller who could send one could claim a password
  // they never chose and clear the *Pristup* warning off their row.
  'passwordSetAt',
] as const

/** Good enough for a dancer's address: a name, an @, a dotted host. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface OwnAccessInput {
  /**
   * Present only on a mistaken or hostile caller: the row is the session's.
   * Accepted in the shape so that naming somebody else can be REFUSED.
   */
  userId?: unknown
  email?: unknown
  password?: unknown
  repeat?: unknown
}

export interface OwnAccessResult {
  status: number
  body: { ok: true; message: string } | { error: string }
}

export interface OwnAccessDeps {
  /** Origin / Sec-Fetch-Site / Content-Type, plus the origins we own. */
  request: AppRequestMeta
  /** The signed-in caller, as the route's guard resolved them. */
  caller: { id: string | number; shared?: unknown }
  /**
   * `payload.update` on the caller's OWN row with the patch this built.
   *
   * It resolves a NAMED outcome for the two failures a reader can act on — the
   * unique index on `users.email`, and the policy that a voditelj's account
   * must keep an address (`user-email-policy.ts`) — and throws for everything
   * else, which becomes the same 500 every other unknown failure gets.
   */
  save: (
    userId: string | number,
    patch: { email?: string | null; password?: string; passwordSetAt?: string },
  ) => Promise<void | 'email-taken' | 'email-required'>
  /** Injectable only so the stamp below is a value a test can assert. */
  now?: () => Date
}

function fail(status: number, error: string): OwnAccessResult {
  return { status, body: { error } }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * `PATCH /api/app/account`.
 *
 * 403/415 for a cross-site or non-JSON request, 403 for a shared login, for a
 * locked key and for a body aimed at another account, 400 for an address that
 * is not one, a password that is too short or mismatched, and for a body that
 * changes nothing, 200 otherwise.
 *
 * **Either field alone is a complete REQUEST, and neither alone is the task.**
 * A dancer who already has an address and only wants a new password must not be
 * made to retype the address, and the reverse is just as true, so the handler
 * refuses only a request that would write nothing. What the *Pristup* mark and the
 * Početna card call done is the PAIR — an address to be written to and a
 * password the dancer chose — and each half of that is recorded here as it
 * arrives (`email`, `passwordSetAt`), never assumed from the other.
 *
 * An empty e-mail CLEARS the address (`null`), which is the honest reading of
 * an emptied field: a dancer who wants their address out of the system may take
 * it out, and the voditelj's link still gets them in. The password has no such
 * reading: an empty password field means "I am not changing it".
 *
 * The session is untouched, the way `set-password` left it: Payload's update
 * adds no session and revokes none, so the dancer's other devices stay signed
 * in, which is what somebody typing a password on a phone expects of their
 * tablet.
 */
export async function handleOwnAccess(
  input: OwnAccessInput | null | undefined,
  deps: OwnAccessDeps,
): Promise<OwnAccessResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return fail(rejection.status, S.unexpected)

  if (input != null && (typeof input !== 'object' || Array.isArray(input))) {
    return fail(400, S.unexpected)
  }
  const body = (input ?? {}) as Record<string, unknown>

  // Rule 4 first: a shared login may change neither field, which is wider than
  // the collection's own "a shared account may not edit itself" only in that it
  // is re-checked here, where `overrideAccess` means the collection is not
  // consulted at all.
  if (deps.caller.shared === true) return fail(403, S.sharedAccount)

  // Rule 3: named, refused, and never quietly dropped.
  for (const key of LOCKED_KEYS) {
    if (key in body) return fail(403, S.lockedField)
  }

  // Rule 2: the row is the session's. A body that names another account is a
  // refusal rather than a no-op, so nothing can read as "it worked".
  if ('userId' in body) {
    const named = body.userId
    const asString =
      typeof named === 'string' || typeof named === 'number' ? String(named).trim() : ''
    if (asString === '' || asString !== String(deps.caller.id)) return fail(403, S.otherAccount)
  }

  const patch: { email?: string | null; password?: string; passwordSetAt?: string } = {}

  if ('email' in body) {
    const email = str(body.email).trim().toLowerCase()
    if (email === '') patch.email = null
    else {
      if (!EMAIL_RE.test(email)) return fail(400, S.badEmail)
      patch.email = email
    }
  }

  if ('password' in body || 'repeat' in body) {
    const password = str(body.password)
    const repeat = str(body.repeat)
    // An untouched pair of password fields is "I am not changing it", not an
    // error: the form sends all three boxes on every save.
    if (password !== '' || repeat !== '') {
      // A password is used verbatim, spaces included: only its length is judged.
      if (password.length < MIN_PASSWORD_LENGTH) return fail(400, S.tooShort)
      if (password !== repeat) return fail(400, S.mismatch)
      patch.password = password
      // The stamp that makes "this person chose their own password" KNOWABLE.
      //
      // Every invited account already carries a password — `ensureDancerLogin`
      // mints a random one nobody will ever know — so the hash column cannot
      // tell a dancer who typed one from a dancer who never has. This write is
      // the only place a person chooses theirs, so it is where the fact is
      // recorded; "Resetiraj lozinku" clears it again. The *Pristup* mark and the
      // Početna card read nothing else.
      patch.passwordSetAt = (deps.now?.() ?? new Date()).toISOString()
    }
  }

  if (Object.keys(patch).length === 0) return fail(400, S.nothingToSave)

  let outcome: void | 'email-taken' | 'email-required'
  try {
    outcome = await deps.save(deps.caller.id, patch)
  } catch {
    return fail(500, S.unexpected)
  }
  if (outcome === 'email-taken') return fail(409, S.emailTaken)
  if (outcome === 'email-required') return fail(400, S.emailRequired)

  // No echo of what was written: the form refreshes the page and reads the
  // stored value back off the server, which is the only copy that matters.
  return { status: 200, body: { ok: true, message: S.saved } }
}
