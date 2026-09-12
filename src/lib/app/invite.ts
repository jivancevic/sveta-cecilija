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

import { INVITABLE_PERMISSIONS } from '@/lib/access/permissions'
import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import { allocateUsername } from './username'

/** Seven days, the life of an invitation link (#419, story 21). */
export const INVITE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * How the invitation reaches the dancer (#463).
 *
 * `email` is the letter Brevo sends; `link` is the voditelj copying it into a
 * text message from their own phone. They differ in exactly one rule and share
 * every other one — see `mintInvitation`.
 */
export type InviteChannel = 'email' | 'link'

/** The Member fields the invitation decides on. Emails stay server-side. */
export interface InviteMember {
  id: string | number
  name?: string | null
  nickname?: string | null
  email?: string | null
  /**
   * For the SMS deep link of "Kopiraj pozivnicu" (#463). A mobile may cross the
   * `/app` boundary and an e-mail may not (ADR-0024); this one never leaves the
   * voditelj's own screen either way.
   */
  mobile?: string | null
  isMoreskant?: unknown
  active?: unknown
}

/** The login behind a Member, as the reverse lookup finds it. */
export interface InviteUser {
  id: string | number
  username?: string | null
  email?: string | null
  /**
   * What that login may do, as stored. Read for ONE reason: an invitation must
   * never be pointed at an account that is more than a dancer (see
   * {@link isDancerLogin}).
   */
  permissions?: readonly unknown[] | null
}

/**
 * Is the login behind this Member one an invitation may land on?
 *
 * True when it holds nothing outside `INVITABLE_PERMISSIONS` (`moreskant` and,
 * since #520, `door`). An empty set counts: a login from before the permission
 * vocabulary is still not a staff account, and refusing it would break
 * re-inviting a dancer whose row predates #393.
 *
 * The rule exists because an invitation MOVES an existing login's e-mail onto
 * the Member's and mails it a password-reset link (see below). On a dancer that
 * is the point: it is how "the letter got lost" is fixed. On an account that
 * also holds `moreska`, `tickets` or `users` it is an account takeover — any
 * voditelj can edit a Member's e-mail, so pressing "Pošalji pozivnicu" on a
 * Member whose login is a colleague's staff account would mail that colleague's
 * reset link to an address of the presser's choosing.
 *
 * Before #462 a staff account carried a `member` link only if a `users` holder
 * set one by hand. `/api/app/link-self` makes exactly that link routine for a
 * voditelj who dances, which is what turns a latent hole into a live one.
 */
export function isDancerLogin(user: InviteUser | null | undefined): boolean {
  if (!user) return true
  const held = Array.isArray(user.permissions) ? user.permissions : []
  const allowed: readonly string[] = INVITABLE_PERMISSIONS
  return held.every((p) => typeof p === 'string' && allowed.includes(p))
}

/** What the invitation email needs; the copy itself lives in lib/email. */
export interface InviteEmail {
  to: string
  /** The nickname the greeting uses, falling back to the member's name. */
  greeting: string
  /** `${baseUrl}/app/prijava?token=…` */
  link: string
}

export interface InviteResult {
  status: number
  body: { ok: true; created: boolean; username: string; message: string } | { error: string }
}

/** What "Kopiraj pozivnicu" hands the voditelj (#463). */
export interface InviteLinkResult {
  status: number
  body:
    | {
        ok: true
        created: boolean
        username: string
        /** `${baseUrl}/app/prijava?token=…`, live for seven days. */
        link: string
        /** The whole Croatian text message, link included, ready to send. */
        message: string
        /** The Member's mobile, for the `sms:` deep link; null when unknown. */
        mobile: string | null
        /** Whom it is for, so a toast can say so. */
        name: string
      }
    | { error: string }
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
    /** Absent for a dancer whose Member row has no address (#463). */
    email?: string
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
  const minted = await mintInvitation(input, deps, 'email')
  if (!minted.ok) return minted.failure
  const { member, created, username, email, link } = minted

  // A send that throws must not surface as a 500 on a voditelj who has just
  // watched an account be created: the login exists, the token is live, and the
  // only thing that failed is the letter. Say so and let them press again.
  try {
    await deps.sendInvite({
      to: email,
      greeting: greetingFor(member),
      link,
    })
  } catch (err) {
    console.error(
      '[handleInvite] invitation mail failed:',
      err instanceof Error ? err.message : err,
    )
    return fail(502, APP_STRINGS.invite.sendFailed)
  }

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

/**
 * POST /api/app/invite/link `{ memberId }` — "Kopiraj pozivnicu" (#463).
 *
 * The same invitation, handed to the voditelj instead of to Brevo. It exists
 * because `POST /api/app/invite` refuses a Member with no e-mail address, and
 * that refusal is a wall in front of the people the society reaches by phone:
 * on the production roster **one** moreškant out of seventy-six has an e-mail.
 *
 * Everything a dancer's login is — the username, the `['moreskant']` bundle,
 * the `member` link, the seven-day token, the takeover guard — is the mail
 * route's, unchanged, because both go through `mintInvitation`. The only two
 * differences are that no address is required and that nothing is sent: the
 * voditelj gets the link and a ready Croatian message and sends it themselves,
 * **by SMS** (`invite-link.ts` has the reason it must not be a messenger).
 */
export async function handleInviteLink(
  input: { memberId?: unknown } | null | undefined,
  deps: InviteDeps,
): Promise<InviteLinkResult> {
  const minted = await mintInvitation(input, deps, 'link')
  if (!minted.ok) return minted.failure as InviteLinkResult
  const { member, created, username, link } = minted

  return {
    status: 200,
    body: {
      ok: true,
      created,
      username,
      link,
      message: APP_STRINGS.inviteLink.message(greetingFor(member), link),
      mobile: typeof member.mobile === 'string' ? member.mobile : null,
      name: greetingFor(member) || String(member.id),
    },
  }
}

/** "Cici", else "Ivan Ivanović", else empty: whom the letter is addressed to. */
function greetingFor(member: InviteMember): string {
  return (
    (typeof member.nickname === 'string' && member.nickname.trim()) ||
    (typeof member.name === 'string' && member.name.trim()) ||
    ''
  )
}

/** What `ensureDancerLogin` needs: the account half of `InviteDeps`. */
export type EnsureLoginDeps = Pick<
  InviteDeps,
  'findUserByMember' | 'usernameTaken' | 'createUser' | 'updateUserEmail' | 'randomPassword'
>

export type EnsureLoginOutcome =
  | { ok: true; user: InviteUser; created: boolean }
  | { ok: false; reason: 'staff-login' | 'create-failed' }

/**
 * The dancer's login: find the one linked to this Member, or open it.
 *
 * **What a moreškant's account IS, in one function.** Three callers now depend
 * on it being one: the invitation mail, "Kopiraj pozivnicu" and a voditelj
 * approving a join claim at a rehearsal (#463). A dancer must end up with the
 * same account whichever door they came through — the same `['moreskant']`
 * bundle, the same `member` link, the same slugged username, the same unusable
 * random password — and three hand-written versions of that is how one of them
 * quietly grants something the others do not.
 *
 * The takeover guard runs first (#462 review) and is the reason this returns a
 * REASON rather than throwing: the Member's login may be a colleague's staff
 * account, and every caller has to refuse that before it moves an e-mail, mints
 * a token or opens a session.
 */
export async function ensureDancerLogin(
  member: InviteMember,
  deps: EnsureLoginDeps,
): Promise<EnsureLoginOutcome> {
  const email = typeof member.email === 'string' ? member.email.trim() : ''

  let user: InviteUser | null = null
  try {
    user = await deps.findUserByMember(member.id)
  } catch {
    user = null
  }

  // Everything below this line assumes the login it found is a dancer's;
  // `isDancerLogin` is where that assumption is checked. It matters as much on
  // the link channel as in the mail: a copied sign-in link is a session in a
  // text message, so aiming one at a colleague's staff account is the same
  // theft by a quieter route.
  if (!isDancerLogin(user)) return { ok: false, reason: 'staff-login' }

  if (!user) {
    const username = await allocateUsername(member.nickname, deps.usernameTaken)
    try {
      user = await deps.createUser({
        username,
        // Omitted rather than empty when there is none: Payload's unique index
        // on `email` would make the second address-less dancer a duplicate.
        ...(email ? { email } : {}),
        password: deps.randomPassword(),
        // The whole bundle, spelled here once: a dancer's login reaches /app
        // and their own answers, nothing else.
        permissions: ['moreskant'],
        member: member.id,
      })
    } catch {
      // The realistic failure is a duplicate email (the address already belongs
      // to another account), which is a data problem the voditelj can fix.
      return { ok: false, reason: 'create-failed' }
    }
    return { ok: true, user, created: true }
  }

  // The Member's e-mail wins: the Member row is where a voditelj maintains a
  // dancer's contact details, and two addresses for one person would mean the
  // sign-in link going to the stale one.
  if (email && typeof user.email === 'string' && user.email.trim().toLowerCase() !== email.toLowerCase()) {
    try {
      await deps.updateUserEmail(user.id, email)
      user = { ...user, email }
    } catch {
      return { ok: false, reason: 'create-failed' }
    }
  }

  return { ok: true, user, created: false }
}

/** The invitation both channels need, or the refusal both would give. */
type MintedInvitation =
  | {
      ok: true
      member: InviteMember
      created: boolean
      username: string
      /** The Member's address, empty on the link channel when there is none. */
      email: string
      link: string
    }
  | { ok: false; failure: InviteResult }

/**
 * Find or create the dancer's login and mint a fresh seven-day link.
 *
 * The whole of what an invitation IS, in one place, because there are three
 * callers now (the mail, "Kopiraj pozivnicu" and the bulk action) and three
 * hand-copied versions of "the Member's e-mail wins" is how that rule ends up
 * true on two of them.
 *
 * The channel changes exactly one thing: whether a Member with no e-mail is a
 * refusal (mail) or ordinary (link).
 */
async function mintInvitation(
  input: { memberId?: unknown } | null | undefined,
  deps: InviteDeps,
  channel: InviteChannel,
): Promise<MintedInvitation> {
  const no = (status: number, error: string): MintedInvitation => ({
    ok: false,
    failure: fail(status, error),
  })

  const rejection = rejectAppRequest(deps.request)
  if (rejection) return no(rejection.status, APP_STRINGS.invite.unexpected)

  // Configuration, checked before anything is created: a relative link in an
  // invitation burns the token and reads to the dancer as a broken system.
  if (!isUsableBaseUrl(deps.baseUrl)) {
    console.error('[mintInvitation] NEXT_PUBLIC_BASE_URL is missing or relative; nothing issued')
    return no(500, APP_STRINGS.invite.baseUrlMissing)
  }

  const memberId = id(input?.memberId)
  if (!memberId) return no(400, APP_STRINGS.invite.missingMember)

  let member: InviteMember | null = null
  try {
    member = await deps.loadMember(memberId)
  } catch {
    member = null
  }
  if (!member) return no(400, APP_STRINGS.invite.missingMember)
  if (member.isMoreskant !== true) return no(400, APP_STRINGS.invite.notMoreskant)
  // `active` defaults to true in the schema, so only an explicit false refuses.
  if (member.active === false) return no(400, APP_STRINGS.invite.notActive)

  const email = typeof member.email === 'string' ? member.email.trim() : ''
  // The one channel difference: a letter needs somewhere to go, a copied link
  // does not. Since #463 a dancer's login needs no address at all
  // (`user-email-policy.ts`), so this is the only place the absence bites.
  if (!email && channel === 'email') return no(400, APP_STRINGS.invite.noEmail)

  const login = await ensureDancerLogin(member, deps)
  if (!login.ok) {
    return no(
      login.reason === 'staff-login' ? 409 : 400,
      login.reason === 'staff-login' ? APP_STRINGS.invite.staffLogin : APP_STRINGS.invite.createFailed,
    )
  }
  const { user, created } = login

  // Target the login by username when it has one: it is unique, stable and
  // unaffected by the email we may have just moved. Payload's forgotPassword
  // resolves exactly one of the two fields.
  const username = typeof user.username === 'string' && user.username ? user.username : ''
  if (!username && !email) {
    // Nothing to aim `forgotPassword` at. Unreachable in practice (every login
    // this flow creates gets a username), and a silent 500 later if it were not
    // checked here.
    return no(500, APP_STRINGS.invite.tokenFailed)
  }
  let token: string | null = null
  try {
    token = await deps.issueResetToken(username ? { username } : { email }, INVITE_EXPIRATION_MS)
  } catch {
    token = null
  }
  if (!token) return no(500, APP_STRINGS.invite.tokenFailed)

  return { ok: true, member, created, username, email, link: signInLink(deps.baseUrl, token) }
}

/**
 * Is this base URL something a link in an email can point at?
 *
 * `NEXT_PUBLIC_BASE_URL` is unset in more environments than one would like (a
 * fresh worktree, a misfiled Coolify variable), and `signInLink` would then
 * happily build `/app/prijava?token=…`, which is a live token inside a dead
 * link. Every handler that mints one checks this first.
 */
export function isUsableBaseUrl(baseUrl: string | null | undefined): boolean {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return false
  try {
    const url = new URL(baseUrl)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * `${baseUrl}/app/prijava?token=…`, the one link every invitation carries.
 *
 * It pointed at `/app/set-password` until #463, which is what the link did back
 * then: a form, then a session. It now opens the session and leaves the
 * password alone, so the URL says what happens. Both mails and the voditelj's
 * "Kopiraj pozivnicu" build it here, once.
 */
export function signInLink(baseUrl: string, token: string): string {
  const base = (baseUrl || '').replace(/\/+$/, '')
  return `${base}/app/prijava?token=${encodeURIComponent(token)}`
}
