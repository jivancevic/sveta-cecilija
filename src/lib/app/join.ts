// The rehearsal join code (#463): how a dancer with no e-mail and no SMS gets
// in, standing in the room.
//
// A voditelj shows one short-lived code (a QR beside the `/app/install`
// one). A dancer scans it, sees the roster by name, taps their own, and waits.
// The voditelj approves with one tap and the dancer's phone drops into `/app`
// signed in. Nothing is mailed, nothing is typed, and nobody invents a password.
//
// **A human approves, a code does not verify.** The alternative was an SMS code
// to prove the number, which needs a gateway, costs money and proves the wrong
// thing anyway: what matters is that this is the right person, and the voditelj
// standing in the room knows their face. So the code opens a QUEUE, not a door.
// That is also what makes the code safe to print: a photograph of the QR taken
// on the way past buys you a place in a list a voditelj will not recognise.
//
// Four rules keep it narrow, and all four are here rather than in the routes:
//
//  1. the code must be live. It expires on its own (`JOIN_CODE_TTL_MS`) and a
//     voditelj can rotate it, so yesterday's photo is worth nothing;
//  2. only an active moreškant with NO login may be claimed. A dancer who
//     already has an account is not claimable, because that would be taking
//     their identity rather than asking for one (the #462 rule, same words);
//  3. one pending claim per Member, enforced by a partial unique index in
//     `migrate-zz-db-join.sql`, so two phones cannot put one dancer in front of
//     the voditelj twice and mint two logins;
//  4. the claim's secret is the dancer's device credential: held hashed, used
//     ONCE, and turned into a session only after a voditelj has said yes.
//
// Pure + DI like every other `/app` handler, so each rule is a row in
// join.test.ts. The Payload and SQL halves are `join-store.ts` and
// `join-data.ts`; the routes are wiring.

import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'

/**
 * Twelve hours: a rehearsal, the drive home and the dancer who tries it in bed.
 * Short enough that a photographed QR is worthless tomorrow, long enough that
 * nobody has to rotate the code mid-evening.
 */
export const JOIN_CODE_TTL_MS = 12 * 60 * 60 * 1000

/**
 * Two hours for a claim. It is the gap between tapping a name and a voditelj
 * looking at their phone, plus a wide margin; past it the dancer taps again.
 */
export const JOIN_CLAIM_TTL_MS = 2 * 60 * 60 * 1000

/**
 * The alphabet a code is drawn from: no `0`/`O`, no `1`/`I`/`L`, nothing that
 * is read wrong off a sheet of paper in a hall. Six characters is 24^6, which
 * is not a secret and does not need to be (see the header) but is well past
 * guessing one by hand while the evening lasts.
 */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const JOIN_CODE_LENGTH = 6

/** A code as it is written down and as it is stored: upper case, trimmed. */
export function normalizeJoinCode(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().toUpperCase()
}

/** Draw a code from the alphabet above; `random` is injected so it is testable. */
export function makeJoinCode(random: (max: number) => number): string {
  let code = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[random(JOIN_CODE_ALPHABET.length)]
  }
  return code
}

/**
 * "do 21:30" / "sutra u 08:00", for the one line that says how long a code has.
 *
 * Europe/Zagreb explicitly, like every other time `/app` prints: the server
 * runs in UTC and a code that says it lasts until 19:30 when it means 21:30 is
 * worse than one that says nothing.
 */
export function formatDateTimeHr(at: Date | string, now = new Date()): string {
  const date = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  const time = new Intl.DateTimeFormat('hr-HR', {
    timeZone: 'Europe/Zagreb',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  const day = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb' }).format(date)
  const today = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb' }).format(now)
  return day === today ? time : `${day} ${time}`
}

/** A code row as the rules read it. */
export interface JoinCode {
  code: string
  expiresAt: Date | string
}

/** A claim row as the rules read it. */
export interface JoinClaim {
  id: string | number
  memberId: string | number
  status: string
  userId: string | number | null
  /** The three digits this device is showing; handed back so a reload keeps them. */
  pairing?: string | null
  expiresAt: Date | string
}

/** What the dancer's phone is told while it waits. */
export type JoinStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'expired'

function expired(at: Date | string, now: number): boolean {
  const ms = at instanceof Date ? at.getTime() : Date.parse(String(at))
  return !Number.isFinite(ms) || ms <= now
}

/** Is this code still worth anything? */
export function codeIsLive(code: JoinCode | null | undefined, now: number): boolean {
  if (!code) return false
  return !expired(code.expiresAt, now)
}

// ---------------------------------------------------------------------------
// 1. The claim: a dancer taps their own name
// ---------------------------------------------------------------------------

export interface JoinClaimResult {
  status: number
  body: { ok: true; status: 'pending'; pairing: string } | { error: string }
  /** The device credential, to be set as an httpOnly cookie by the route. */
  secret?: string
}

/** A Member as the claim rules read it. Names only: this list is public. */
export interface JoinMember {
  id: string | number
  name?: string | null
  nickname?: string | null
  active?: unknown
  isMoreskant?: unknown
}

export interface JoinClaimDeps {
  request: AppRequestMeta
  now: () => number
  /** False when this caller has spent their window (`join-rate-limit.ts`). */
  allow: (code: string) => boolean
  loadCode: (code: string) => Promise<JoinCode | null>
  loadMember: (memberId: string) => Promise<JoinMember | null>
  /** Does some login already point at this Member (`member-logins.ts`)? */
  memberHasLogin: (memberId: string) => Promise<boolean>
  /** A fresh, unguessable device credential. */
  makeSecret: () => string
  /**
   * Three digits the dancer reads off their own screen (#463 review).
   *
   * Not a credential and never checked by the server: the voditelj checks it,
   * by eye, against the person in front of them. It exists because approval is
   * a tap on a NAME, and a name is exactly what a stranger holding the code can
   * also tap. Without it the dancer whose name was taken reads "somebody is
   * already waiting for this name", assumes it is their own request, and asks
   * the voditelj to approve the stranger's phone.
   */
  makePairing: () => string
  /**
   * Writes the claim. Resolves false when the partial unique index refused it,
   * which means this Member already has a pending claim: somebody in the room
   * (possibly this dancer, on their other phone) got there first.
   */
  insertClaim: (row: {
    memberId: string | number
    code: string
    secret: string
    pairing: string
    expiresAtMs: number
  }) => Promise<boolean>
}

/**
 * POST /api/app/join `{ code, memberId }`.
 *
 * 403/415 cross-site or non-JSON, 400 for a dead code or a Member who may not
 * be claimed, 409 when a claim for that Member is already waiting, 200 with the
 * device secret otherwise.
 *
 * Throttled before the lookup, like `/api/app/forgot`: this is an
 * unauthenticated POST that writes a row. Unlike that route it answers the
 * throttle honestly with a 429, because there is nothing to hide here — the
 * code holder is standing in the room and the list is already in front of them.
 */
export async function handleJoinClaim(
  input: { code?: unknown; memberId?: unknown } | null | undefined,
  deps: JoinClaimDeps,
): Promise<JoinClaimResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.join.unexpected } }

  const code = normalizeJoinCode(input?.code)
  const memberId =
    typeof input?.memberId === 'string'
      ? input.memberId.trim()
      : typeof input?.memberId === 'number'
        ? String(input.memberId)
        : ''
  if (!code || !memberId) return { status: 400, body: { error: APP_STRINGS.join.badCode } }

  if (!deps.allow(code)) return { status: 429, body: { error: APP_STRINGS.join.throttled } }

  const now = deps.now()
  let live: JoinCode | null = null
  try {
    live = await deps.loadCode(code)
  } catch {
    return { status: 500, body: { error: APP_STRINGS.join.unexpected } }
  }
  if (!codeIsLive(live, now)) return { status: 400, body: { error: APP_STRINGS.join.badCode } }

  let member: JoinMember | null = null
  try {
    member = await deps.loadMember(memberId)
  } catch {
    member = null
  }
  if (!member || member.isMoreskant !== true || member.active === false) {
    return { status: 400, body: { error: APP_STRINGS.join.badMember } }
  }

  // The #462 rule in the same words: a Member somebody's login already points
  // at is not claimable, because that is taking an identity rather than asking
  // for one. The dancer who lost their phone asks the voditelj for a link.
  let hasLogin = true
  try {
    hasLogin = await deps.memberHasLogin(memberId)
  } catch {
    // Unreadable must not read as free.
    return { status: 500, body: { error: APP_STRINGS.join.unexpected } }
  }
  if (hasLogin) return { status: 409, body: { error: APP_STRINGS.join.alreadyHasLogin } }

  const secret = deps.makeSecret()
  const pairing = deps.makePairing()
  let written = false
  try {
    written = await deps.insertClaim({
      memberId: member.id,
      code,
      secret,
      pairing,
      expiresAtMs: now + JOIN_CLAIM_TTL_MS,
    })
  } catch {
    return { status: 500, body: { error: APP_STRINGS.join.unexpected } }
  }
  if (!written) return { status: 409, body: { error: APP_STRINGS.join.alreadyPending } }

  return { status: 200, body: { ok: true, status: 'pending', pairing }, secret }
}

// ---------------------------------------------------------------------------
// 2. The wait: has a voditelj said yes yet?
// ---------------------------------------------------------------------------

export interface JoinStatusResult {
  status: number
  /**
   * `pairing` rides along with a pending answer so a phone that reloaded (or
   * was locked and reopened) can show the dancer their number again. It is the
   * claim's own, and the caller proved that with the claim secret in its
   * cookie, so this hands the device nothing it did not already have.
   */
  body: { status: JoinStatus; pairing?: string | null }
  /** The session cookie, on approval only. */
  setCookie?: string
  /** True once the claim is spent, so the route clears the join cookie. */
  clearJoinCookie?: boolean
}

export interface JoinStatusDeps {
  request: AppRequestMeta
  now: () => number
  /** The plaintext secret from the device's httpOnly cookie, if any. */
  secret: string | null
  loadClaimBySecret: (secret: string) => Promise<JoinClaim | null>
  /**
   * Spends the claim, and reports whether THIS call is the one that spent it.
   * False means another poll got there first (#463 review), and this one must
   * open nothing: the phone's poll does not wait for its own last request.
   */
  markClaimUsed: (claimId: string | number) => Promise<boolean>
  openSession: (userId: string | number) => Promise<string>
}

/**
 * POST /api/app/join/status — the dancer's phone, polling while it waits.
 *
 * Everything but `approved` is a plain answer. `approved` is the moment the
 * account comes into existence for this device: the claim is marked spent
 * FIRST, then the session is opened, so a double poll cannot mint two sessions
 * off one approval.
 *
 * A POST rather than a GET even though it mostly reads, because it sometimes
 * writes and always sets a cookie, and the `/app` guard only applies to a body
 * that has a content type.
 */
export async function handleJoinStatus(deps: JoinStatusDeps): Promise<JoinStatusResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { status: 'none' } }

  const secret = typeof deps.secret === 'string' ? deps.secret.trim() : ''
  if (!secret) return { status: 200, body: { status: 'none' } }

  let claim: JoinClaim | null = null
  try {
    claim = await deps.loadClaimBySecret(secret)
  } catch {
    return { status: 500, body: { status: 'none' } }
  }
  if (!claim) return { status: 200, body: { status: 'expired' }, clearJoinCookie: true }

  if (claim.status === 'rejected') {
    return { status: 200, body: { status: 'rejected' }, clearJoinCookie: true }
  }
  if (expired(claim.expiresAt, deps.now()) || claim.status === 'expired' || claim.status === 'used') {
    return { status: 200, body: { status: 'expired' }, clearJoinCookie: true }
  }
  // `approving` is a decision in flight: the voditelj has tapped and the login
  // is being opened. It is still a wait from the phone's point of view.
  if (claim.status !== 'approved' || claim.userId == null) {
    return { status: 200, body: { status: 'pending', pairing: claim.pairing ?? null } }
  }

  let spent = false
  try {
    spent = await deps.markClaimUsed(claim.id)
  } catch {
    return { status: 500, body: { status: 'pending' } }
  }
  // Somebody else already turned this approval into a session — on this same
  // device, one poll ago. Saying `expired` rather than minting a second session
  // is what makes "one approval, one session" true rather than aspirational.
  if (!spent) return { status: 200, body: { status: 'expired' }, clearJoinCookie: true }

  let cookie: string
  try {
    cookie = await deps.openSession(claim.userId)
  } catch {
    return { status: 500, body: { status: 'pending' } }
  }

  return {
    status: 200,
    body: { status: 'approved' },
    setCookie: cookie,
    clearJoinCookie: true,
  }
}

// ---------------------------------------------------------------------------
// 3. The decision: one tap from the voditelj
// ---------------------------------------------------------------------------

export interface JoinDecideResult {
  status: number
  body: { ok: true; decision: 'approve' | 'reject'; username?: string } | { error: string }
}

/** What opening the dancer's login came to (`ensureDancerLogin`, #463). */
export type JoinLoginOutcome =
  | { ok: true; id: string | number; username: string }
  | { ok: false; reason: 'staff-login' | 'create-failed' }

export interface JoinDecideDeps {
  request: AppRequestMeta
  now: () => number
  caller: { id: string | number }
  loadClaim: (claimId: string) => Promise<JoinClaim | null>
  /**
   * Takes the decision atomically: false when somebody else already has it.
   * Everything after this point CREATES an account, so two voditelji tapping
   * the same row a second apart must not both get past here (#463 review).
   */
  claimDecision: (claimId: string | number, deciderId: string | number) => Promise<boolean>
  /** Hands it back when the login could not be opened after all. */
  releaseDecision: (claimId: string | number) => Promise<void>
  /** Marks a claim nobody answered in time, so it stops blocking the Member. */
  expireClaim: (claimId: string | number) => Promise<void>
  loadMember: (memberId: string) => Promise<JoinMember | null>
  memberHasLogin: (memberId: string) => Promise<boolean>
  /**
   * Find or create the dancer's login — the SAME function the invitation uses
   * (`ensureDancerLogin`), so a dancer who joins at a rehearsal and a dancer
   * who is invited by SMS end up with identical accounts. It reports WHY it
   * refused, because "that Member's login is a staff account" is the #462
   * takeover guard and deserves its own sentence.
   */
  ensureLogin: (member: JoinMember) => Promise<JoinLoginOutcome>
  approve: (claimId: string | number, userId: string | number, deciderId: string | number) => Promise<void>
  reject: (claimId: string | number, deciderId: string | number) => Promise<void>
}

/**
 * POST /api/app/join/decide `{ claimId, decision }`, voditelj only.
 *
 * The eligibility of the Member is checked AGAIN here, not only when the claim
 * was made: minutes pass between a tap in the hall and a tap on the voditelj's
 * phone, and in that gap the dancer may have been invited by SMS, retired, or
 * un-flagged. Approving a stale claim would mint a second login for somebody
 * who already has one.
 */
export async function handleJoinDecide(
  input: { claimId?: unknown; decision?: unknown } | null | undefined,
  deps: JoinDecideDeps,
): Promise<JoinDecideResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.join.unexpected } }

  const claimId =
    typeof input?.claimId === 'string'
      ? input.claimId.trim()
      : typeof input?.claimId === 'number'
        ? String(input.claimId)
        : ''
  const decision = input?.decision === 'reject' ? 'reject' : input?.decision === 'approve' ? 'approve' : null
  if (!claimId || !decision) return { status: 400, body: { error: APP_STRINGS.join.badClaim } }

  let claim: JoinClaim | null = null
  try {
    claim = await deps.loadClaim(claimId)
  } catch {
    return { status: 500, body: { error: APP_STRINGS.join.unexpected } }
  }
  if (!claim) return { status: 404, body: { error: APP_STRINGS.join.badClaim } }
  if (claim.status !== 'pending') return { status: 409, body: { error: APP_STRINGS.join.decided } }
  if (expired(claim.expiresAt, deps.now())) {
    // Mark it, do not merely refuse it: a row left `pending` past its expiry is
    // one the Member can never replace, because the partial unique index counts
    // it (#463 review). The claim route sweeps these too; this is the other
    // door to the same state.
    try {
      await deps.expireClaim(claim.id)
    } catch {
      // The refusal below is the answer either way.
    }
    return { status: 409, body: { error: APP_STRINGS.join.claimExpired } }
  }

  if (decision === 'reject') {
    try {
      await deps.reject(claim.id, deps.caller.id)
    } catch {
      return { status: 500, body: { error: APP_STRINGS.join.unexpected } }
    }
    return { status: 200, body: { ok: true, decision } }
  }

  // From here on the decision creates an account, so take it exclusively first.
  let mine = false
  try {
    mine = await deps.claimDecision(claim.id, deps.caller.id)
  } catch {
    return { status: 500, body: { error: APP_STRINGS.join.unexpected } }
  }
  if (!mine) return { status: 409, body: { error: APP_STRINGS.join.decided } }

  // Every refusal below has to hand the claim back, or a voditelj who taps on a
  // dancer that turns out to be ineligible leaves the row stuck in `approving`,
  // where nothing can see it and nothing can decide it.
  const release = async (result: JoinDecideResult): Promise<JoinDecideResult> => {
    try {
      await deps.releaseDecision(claim!.id)
    } catch {
      // Nothing better to do: the answer to the voditelj is unchanged.
    }
    return result
  }

  const memberId = String(claim.memberId)
  let member: JoinMember | null = null
  try {
    member = await deps.loadMember(memberId)
  } catch {
    member = null
  }
  if (!member || member.isMoreskant !== true || member.active === false) {
    return release({ status: 400, body: { error: APP_STRINGS.join.badMember } })
  }

  let hasLogin = true
  try {
    hasLogin = await deps.memberHasLogin(memberId)
  } catch {
    return release({ status: 500, body: { error: APP_STRINGS.join.unexpected } })
  }
  if (hasLogin) return release({ status: 409, body: { error: APP_STRINGS.join.alreadyHasLogin } })

  let login: JoinLoginOutcome
  try {
    login = await deps.ensureLogin(member)
  } catch {
    login = { ok: false, reason: 'create-failed' }
  }
  if (!login.ok) {
    // The takeover guard (#462 review) speaks for itself; anything else is a
    // write that did not happen, and pressing again is the fix.
    return release(
      login.reason === 'staff-login'
        ? { status: 409, body: { error: APP_STRINGS.invite.staffLogin } }
        : { status: 500, body: { error: APP_STRINGS.join.loginFailed } },
    )
  }

  try {
    await deps.approve(claim.id, login.id, deps.caller.id)
  } catch {
    // The login exists and the claim does not know it. Saying so is better than
    // a silent 500: pressing again finds the login through the Member and this
    // time only the claim has to be written.
    return { status: 500, body: { error: APP_STRINGS.join.approveFailed } }
  }

  return { status: 200, body: { ok: true, decision, username: login.username } }
}
