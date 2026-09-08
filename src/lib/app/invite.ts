// "Pošalji pozivnicu": the one way a moreškant gets a login (#424, ADR-0024).
//
// A voditelj opens a Member, ticks Moreškant, fills the email and presses one
// button. Everything that follows is here: the four refusals, the reverse
// lookup that makes a second press idempotent, the username the login gets and
// the seven-day link the dancer receives. The voditelj never chooses a
// permission set, so the invitation bundle is `['moreskant']` and nothing else
// (#419, story 6).
//
// Pure + DI, like every other `/app` handler: no Payload, no fetch, no socket,
// so each rule is a table row in invite.test.ts rather than a browser click.
// The route file (`src/app/api/app/invite/route.ts`) is only the wiring, and
// the permission gate is `requirePermission(req, 'moreska')` there — the local
// API runs `overrideAccess: true`, so collection access does not gate a route
// (CLAUDE.md hard rule).

import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import { allocateUsername } from './username'

/** Seven days, the life of an invitation link (#419, story 21). */
export const INVITE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000

/** The Member fields the invitation decides on. Emails stay server-side. */
export interface InviteMember {
  id: string | number
  name?: string | null
  nickname?: string | null
  email?: string | null
  isMoreskant?: unknown
  active?: unknown
}

/** The login behind a Member, as the reverse lookup finds it. */
export interface InviteUser {
  id: string | number
  username?: string | null
  email?: string | null
}

/** What the invitation email needs; the copy itself lives in lib/email. */
export interface InviteEmail {
  to: string
  /** The nickname the greeting uses, falling back to the member's name. */
  greeting: string
  /** `${baseUrl}/app/set-password?token=…` */
  link: string
}

export interface InviteResult {
  status: number
  body: { ok: true; created: boolean; username: string; message: string } | { error: string }
}

export interface InviteDeps {
  /** Origin / Sec-Fetch-Site / Content-Type, plus the origins we own. */
  request: AppRequestMeta
  /** `${NEXT_PUBLIC_BASE_URL}`, the origin the link points at. */
  baseUrl: string
  loadMember: (id: string) => Promise<InviteMember | null>
  /** The User whose `member` link is this Member, or null. */
  findUserByMember: (memberId: string | number) => Promise<InviteUser | null>
  /** Is this username already on some account? */
  usernameTaken: (candidate: string) => Promise<boolean>
  createUser: (data: {
    username: string
    email: string
    password: string
    permissions: string[]
    member: string | number
  }) => Promise<InviteUser>
  /** Keeps an existing login's address on the Member's email (see below). */
  updateUserEmail: (id: string | number, email: string) => Promise<void>
  /** Payload's `forgotPassword`, email disabled; resolves with the token. */
  issueResetToken: (target: { username?: string; email?: string }, expirationMs: number) => Promise<string | null>
  /** Sends the Croatian invitation mail through the shared Brevo poster. */
  sendInvite: (mail: InviteEmail) => Promise<void>
  /** A password nobody will ever use: the dancer sets their own from the link. */
  randomPassword: () => string
}

function fail(status: number, error: string): InviteResult {
  return { status, body: { error } }
}

function id(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * POST /api/app/invite `{ memberId }`.
 *
 * 403/415 for a cross-site or non-JSON request (the same guard the login and
 * attendance routes carry: this is a cookie-authenticated POST that creates an
 * account and sends mail). 400 with a Croatian sentence for each of the four
 * profile problems a voditelj can fix themselves. 200 otherwise, with the
 * username so the voditelj can tell the dancer what to type.
 *
 * **Idempotent on the User, never on the link.** A second press finds the same
 * login through the `member` reverse lookup and only mints a fresh token, which
 * is exactly what "the email got lost" needs (#419, story 7).
 *
 * **The Member's email wins.** When the linked login carries a different
 * address, the invitation moves the login onto the Member's — the Member row is
 * where a voditelj maintains a dancer's contact details, and two addresses for
 * one person would mean "Zaboravljena lozinka" silently mailing the stale one.
 */
export async function handleInvite(
  input: { memberId?: unknown } | null | undefined,
  deps: InviteDeps,
): Promise<InviteResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return fail(rejection.status, APP_STRINGS.invite.unexpected)

  const memberId = id(input?.memberId)
  if (!memberId) return fail(400, APP_STRINGS.invite.missingMember)

  let member: InviteMember | null = null
  try {
    member = await deps.loadMember(memberId)
  } catch {
    member = null
  }
  if (!member) return fail(400, APP_STRINGS.invite.missingMember)
  if (member.isMoreskant !== true) return fail(400, APP_STRINGS.invite.notMoreskant)
  // `active` defaults to true in the schema, so only an explicit false refuses.
  if (member.active === false) return fail(400, APP_STRINGS.invite.notActive)

  const email = typeof member.email === 'string' ? member.email.trim() : ''
  if (!email) return fail(400, APP_STRINGS.invite.noEmail)

  let user: InviteUser | null = null
  try {
    user = await deps.findUserByMember(member.id)
  } catch {
    user = null
  }

  let created = false
  if (!user) {
    const username = await allocateUsername(member.nickname, deps.usernameTaken)
    try {
      user = await deps.createUser({
        username,
        email,
        password: deps.randomPassword(),
        // The whole bundle, spelled here once: a dancer's login reaches /app
        // and their own answers, nothing else.
        permissions: ['moreskant'],
        member: member.id,
      })
    } catch {
      // The realistic failure is a duplicate email (the address already belongs
      // to another account), which is a data problem the voditelj can fix.
      return fail(400, APP_STRINGS.invite.createFailed)
    }
    created = true
  } else if (typeof user.email === 'string' && user.email.trim().toLowerCase() !== email.toLowerCase()) {
    try {
      await deps.updateUserEmail(user.id, email)
      user = { ...user, email }
    } catch {
      return fail(400, APP_STRINGS.invite.createFailed)
    }
  }

  // Target the login by username when it has one: it is unique, stable and
  // unaffected by the email we may have just moved. Payload's forgotPassword
  // resolves exactly one of the two fields.
  const username = typeof user.username === 'string' && user.username ? user.username : ''
  let token: string | null = null
  try {
    token = await deps.issueResetToken(
      username ? { username } : { email },
      INVITE_EXPIRATION_MS,
    )
  } catch {
    token = null
  }
  if (!token) return fail(500, APP_STRINGS.invite.tokenFailed)

  await deps.sendInvite({
    to: email,
    greeting:
      (typeof member.nickname === 'string' && member.nickname.trim()) ||
      (typeof member.name === 'string' && member.name.trim()) ||
      '',
    link: setPasswordLink(deps.baseUrl, token),
  })

  return {
    status: 200,
    body: {
      ok: true,
      created,
      username,
      message: created ? APP_STRINGS.invite.sentNew : APP_STRINGS.invite.sentAgain,
    },
  }
}

/** `${baseUrl}/app/set-password?token=…`, the one link both mails carry. */
export function setPasswordLink(baseUrl: string, token: string): string {
  const base = (baseUrl || '').replace(/\/+$/, '')
  return `${base}/app/set-password?token=${encodeURIComponent(token)}`
}
