// Opening an account, and getting the person into it (#510).
//
// Two writes with one shape between them: **the handover**. An account is only
// useful once somebody can sign in to it, and this society has two kinds of
// login, so there are exactly two ways that can happen:
//
//   - **An address on the row** → a sign-in link, minted exactly the way
//     "Zaboravljena lozinka" mints one (`issueAppResetToken`, one hour,
//     `/app/session?token=`). No password is set, none is shown, and the
//     `users` holder forwards the link to the person it belongs to.
//   - **No address** (the shared `tehnika` door login, a partner POS) → a
//     temporary password, generated here, shown once on the screen that asked
//     for it and never again. Nothing logs it, nothing e-mails it, and the
//     database keeps only Payload's hash of it.
//
// That is also why the password generator is not `randomBytes(32).toString
// ('hex')` like the invitation's: this one is READ OFF A SCREEN AND TYPED INTO
// A PHONE at a gate, so it drops the characters that get mistaken for each
// other and stays short enough to dictate.
//
// **An address is necessary for the link, not sufficient.** The link opens a
// Cecilija session (`POST /api/app/session`), so it only helps an account whose
// permission set unlocks a screen — `mayOpenAppSession`, the shell's own rule.
// An `editor`-only login has its address and no Cecilija, so it gets the
// password instead and signs in at the Backoffice. The #510 review caught the
// inverse of this: handing out a link the session handler then refused, on an
// account whose password had deliberately been made unusable.
//
// Pure + DI like every other `/app` handler; the Payload calls are the route's.

import { randomBytes } from 'node:crypto'
import { emailRequiredFor } from '@/lib/access/user-email-policy'
import type { Permission } from '@/lib/access/permissions'
import { APP_STRINGS } from './strings'
import { isUsableBaseUrl, signInLink } from './invite'
import { RESET_EXPIRATION_MS } from './forgot'
import type { AppRequestMeta } from './request-guard'
import { mayOpenAppSession } from './token-login'
import {
  fail,
  loadOr404,
  normaliseEmail,
  normaliseName,
  parsePermissionSet,
  refuseCaller,
  sharedMayHold,
  type UsersCaller,
  type UsersResult,
  type UsersTarget,
} from './users-admin'

const S = APP_STRINGS.users

/**
 * The alphabet a handed-over password is drawn from.
 *
 * `l`, `I`, `1`, `O` and `0` are deliberately absent: the whole point of this
 * string is that one person reads it aloud or off a screen and another types it
 * into a phone, and those five are where that fails. What is left is 56
 * characters, which at fourteen of them is about 81 bits of entropy — far more
 * than a password anybody would have chosen instead.
 */
export const TEMP_PASSWORD_ALPHABET =
  'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Long enough to be safe, short enough to dictate over a phone. */
export const TEMP_PASSWORD_LENGTH = 14

/** Bytes from the OS. Injected in tests so the draw itself is assertable. */
export type RandomBytes = (count: number) => Uint8Array

const osRandom: RandomBytes = (count) => new Uint8Array(randomBytes(count))

/**
 * A password nobody chose, drawn without modulo bias.
 *
 * The rejection sampling matters more than it looks: folding a byte with `%`
 * over a 56-character alphabet would make the first 32 characters slightly
 * likelier than the rest, which is a weakness nobody would ever notice and no
 * reason to accept when skipping the out-of-range draws costs three lines.
 */
export function generateTemporaryPassword(
  random: RandomBytes = osRandom,
  length: number = TEMP_PASSWORD_LENGTH,
): string {
  const n = TEMP_PASSWORD_ALPHABET.length
  // The largest multiple of the alphabet that fits in a byte; anything at or
  // above it is drawn again rather than folded.
  const limit = Math.floor(256 / n) * n
  let out = ''
  while (out.length < length) {
    const chunk = random(length * 2)
    for (const byte of chunk) {
      if (byte >= limit) continue
      out += TEMP_PASSWORD_ALPHABET[byte % n]
      if (out.length === length) break
    }
  }
  return out
}

/** A password that exists only because Payload requires one on create. */
export function unusablePassword(): string {
  return randomBytes(32).toString('hex')
}

/**
 * The login name, as a login field can carry it: lowercase ASCII, digits, dot,
 * dash and underscore, starting on a letter or a digit. Null when it cannot.
 *
 * The same shape `allocateUsername` produces for a dancer (#424), so the two
 * doors into the Users table agree on what a username is. Payload's own
 * `loginWithUsername` accepts far more than this; the narrowing is ours,
 * because a username with a space in it is a support call and never a feature.
 */
export function normaliseUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9._-]{1,31}$/.test(value) ? value : null
}

// `normaliseEmail` moved to `users-admin.ts` with #621, where the PATCH that
// edits an existing address lives. The create still calls it; it is imported
// rather than re-declared so the two doors into the column agree on what an
// address is, and it sits in `users-admin` rather than here because this file
// already imports from that one and the other direction would be a cycle.

/** How this person gets in the first time. `none` is a repair, not a success. */
export type Handover =
  | { kind: 'password'; password: string }
  | { kind: 'link'; link: string }
  | { kind: 'none' }

/** The row the seam is asked to insert. Email is absent, never empty. */
export interface NewUserData {
  username: string
  email?: string
  name?: string
  permissions: Permission[]
  shared: boolean
  password: string
}

export interface CreateUserDeps {
  request: AppRequestMeta
  /** Who is opening the account; a shared login may not (ADR-0022). */
  caller: UsersCaller
  /** `NEXT_PUBLIC_BASE_URL`: the origin the sign-in link points at. */
  baseUrl: string
  usernameTaken: (username: string) => Promise<boolean>
  emailTaken: (email: string) => Promise<boolean>
  create: (data: NewUserData) => Promise<{ id: string; username: string }>
  /** Payload's `forgotPassword`, email disabled; resolves with the token. */
  issueResetToken: (
    target: { username?: string; email?: string },
    expirationMs: number,
  ) => Promise<string | null>
  temporaryPassword: () => string
  unusablePassword: () => string
}

/**
 * POST /api/app/users `{ username, email?, name?, permissions, shared? }`.
 *
 * 403 cross-site, 400 for a username, address or permission word that is not
 * one (and for a named-person set with no address), 409 when the username or
 * the address already belongs to somebody, 200 with the handover otherwise.
 */
export async function handleCreateUser(
  input:
    | {
        username?: unknown
        email?: unknown
        name?: unknown
        permissions?: unknown
        shared?: unknown
      }
    | null
    | undefined,
  deps: CreateUserDeps,
): Promise<UsersResult> {
  const refused = refuseCaller(deps.request, deps.caller)
  if (refused) return refused

  const username = normaliseUsername(input?.username)
  if (!username) {
    const typed = typeof input?.username === 'string' ? input.username.trim() : ''
    return fail(400, typed ? S.create.badUsername : S.create.missingUsername)
  }

  const rawEmail = typeof input?.email === 'string' ? input.email.trim() : ''
  const email = rawEmail ? normaliseEmail(rawEmail) : null
  if (rawEmail && !email) return fail(400, S.create.badEmail)

  const permissions = parsePermissionSet(input?.permissions)
  if (!permissions) return fail(400, S.permissions.invalid)

  const shared = input?.shared === true
  if (!sharedMayHold(shared, permissions)) return fail(400, S.permissions.sharedUsers)

  if (emailRequiredFor({ permissions }) && !email) {
    return fail(400, S.permissions.emailRequired)
  }

  // Whether this account gets the link or the password, decided once: an
  // address is necessary and `mayOpenAppSession` is the rest of it.
  const byLink = Boolean(email) && mayOpenAppSession({ id: '', permissions, shared })

  // A link that is not absolute is a link nobody can open. Checked before the
  // row exists, so a misconfigured deployment refuses instead of opening an
  // account nobody can reach (`isUsableBaseUrl`, #424).
  if (byLink && !isUsableBaseUrl(deps.baseUrl)) {
    console.error('[handleCreateUser] NEXT_PUBLIC_BASE_URL is missing or relative')
    return fail(500, S.create.failed)
  }

  try {
    if (await deps.usernameTaken(username)) return fail(409, S.create.usernameTaken)
    if (email && (await deps.emailTaken(email))) return fail(409, S.create.emailTaken)
  } catch (err) {
    console.error('[handleCreateUser] lookup failed:', err instanceof Error ? err.message : err)
    return fail(500, S.create.failed)
  }

  const name = normaliseName(input?.name)
  // The password the row is created with is NOT the one that gets handed over
  // when there is an address: the link is the way in then, so the account gets
  // one nobody holds rather than a short one nobody was told.
  const password = byLink ? deps.unusablePassword() : deps.temporaryPassword()

  let created: { id: string; username: string }
  try {
    created = await deps.create({
      username,
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      permissions,
      shared,
      password,
    })
  } catch (err) {
    console.error('[handleCreateUser] create failed:', err instanceof Error ? err.message : err)
    return fail(500, S.create.failed)
  }

  const handover: Handover = byLink
    ? await linkHandover(
        { username: created.username },
        deps.baseUrl,
        deps.issueResetToken,
      )
    : { kind: 'password', password }

  return {
    status: 200,
    body: {
      ok: true,
      id: created.id,
      username: created.username,
      handover,
      message: S.create.created(created.username),
    },
  }
}

export interface ResetPasswordDeps {
  request: AppRequestMeta
  caller: UsersCaller
  baseUrl: string
  loadUser: (id: string) => Promise<UsersTarget | null>
  setPassword: (id: string, password: string) => Promise<void>
  issueResetToken: (
    target: { username?: string; email?: string },
    expirationMs: number,
  ) => Promise<string | null>
  temporaryPassword: () => string
}

/**
 * POST /api/app/users/[id]/reset-password.
 *
 * The same two branches as the create, on an account that already exists: an
 * address gets a link and keeps its password, an address-less login gets a new
 * temporary password and loses its old one at once.
 *
 * Rotating the `tehnika` password is exactly what a `users` holder is for, so
 * the shared rule here is about the CALLER rather than the target (ADR-0022,
 * widened by the #510 review): a login several people hold administers no
 * account, its own included, and `refuseCaller` says so before anything is
 * read.
 */
export async function handleResetPassword(
  targetId: string,
  deps: ResetPasswordDeps,
): Promise<UsersResult> {
  const refused = refuseCaller(deps.request, deps.caller)
  if (refused) return refused

  const found = await loadOr404(targetId, deps.loadUser)
  if ('missing' in found) return found.missing
  const user = found.user

  const email = user.email?.trim() ?? ''
  // The same fork the create makes, for the same reason: a link this account
  // cannot use is worse than a password it can.
  if (email && mayOpenAppSession({ id: user.id, permissions: user.permissions, shared: user.shared })) {
    if (!isUsableBaseUrl(deps.baseUrl)) {
      console.error('[handleResetPassword] NEXT_PUBLIC_BASE_URL is missing or relative')
      return fail(500, S.reset.failed)
    }
    const handover = await linkHandover(
      user.username ? { username: user.username } : { email },
      deps.baseUrl,
      deps.issueResetToken,
    )
    if (handover.kind === 'none') return fail(500, S.reset.failed)
    return { status: 200, body: { ok: true, handover } }
  }

  const password = deps.temporaryPassword()
  try {
    await deps.setPassword(user.id, password)
  } catch (err) {
    console.error('[handleResetPassword] save failed:', err instanceof Error ? err.message : err)
    return fail(500, S.reset.failed)
  }

  return { status: 200, body: { ok: true, handover: { kind: 'password', password } } }
}

/**
 * The sign-in link, or `none` when the token could not be minted.
 *
 * `none` rather than a throw because the two callers read it differently: on a
 * create the account is already there and saying "it failed" would have the
 * reader press again into their own username, while on a reset nothing has
 * happened yet and 500 is the honest answer.
 */
async function linkHandover(
  target: { username?: string; email?: string },
  baseUrl: string,
  issueResetToken: ResetPasswordDeps['issueResetToken'],
): Promise<Handover> {
  let token: string | null = null
  try {
    token = await issueResetToken(target, RESET_EXPIRATION_MS)
  } catch (err) {
    console.error('[users] reset token failed:', err instanceof Error ? err.message : err)
    token = null
  }
  if (!token) return { kind: 'none' }
  return { kind: 'link', link: signInLink(baseUrl, token) }
}
