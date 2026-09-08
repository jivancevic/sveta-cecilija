// The one answer route, as a pure DI'd handler (#422).
//
// Everything that writes an attendance row goes through here: a dancer tapping
// Dolazim on a card, a voditelj answering on someone's behalf from the detail
// view, and the army move control. One writer means one place where the rules
// (`./rules.ts`) are applied and one place where `answeredBy` / `answeredAt` are
// recorded, which is what makes "who said this and when" answerable at all.
//
// The write is an UPSERT on the unique (performance, member) pair, and `clear`
// deletes the row: "no answer" is the absence of a row (glossary: *Attendance*),
// never a third status value.
//
// Pure + injected deps in the `login.ts` / `route-guard.test.ts` style, so every
// status code and both write paths are tested without Payload or a socket. The
// route file is the wiring, and `requirePermission` is what turns an anonymous
// caller into the 401 this handler never has to model.

import {
  decideAttendanceAnswer,
  isVoditelj,
  type AnswerRequest,
  type Army,
  type AttendanceActor,
  type AttendanceMember,
  type AttendancePerformance,
  type AttendanceStatus,
} from './rules'
import { rejectAppRequest, type AppRequestMeta } from '@/lib/app/request-guard'

export interface AnswerBody {
  performanceId?: unknown
  memberId?: unknown
  /** `coming`, `not_coming` or `clear`. */
  status?: unknown
  /** Voditelj only. */
  army?: unknown
}

/** The row already stored for the pair, if any. */
export interface ExistingAnswer {
  id: string | number
  army: Army | null
  /**
   * The answer that stands before this write. Read by the withdrawal
   * notification (#436): "a dolazim turned into anything else" is a fact about
   * the PREVIOUS row, and once the upsert has run it is unrecoverable.
   */
  status?: AttendanceStatus | null
}

export interface AnswerDeps {
  /**
   * Origin / Sec-Fetch-Site / Content-Type, plus the origins we own. Every
   * cookie-authenticated `/app` POST runs the same cross-site check (#421
   * follow-up): this route writes on the strength of a session cookie, which is
   * exactly what a cross-site `fetch` can aim at a signed-in dancer's browser.
   */
  request: AppRequestMeta
  actor: AttendanceActor
  loadPerformance: (id: string) => Promise<AttendancePerformance | null>
  loadMember: (id: string) => Promise<AttendanceMember | null>
  findExisting: (performanceId: string, memberId: string) => Promise<ExistingAnswer | null>
  create: (row: {
    performance: string
    member: string
    status: 'coming' | 'not_coming'
    army: Army | null
    answeredBy: string | number | null
    answeredAt: string
  }) => Promise<unknown>
  update: (
    id: string | number,
    row: {
      status: 'coming' | 'not_coming'
      army: Army | null
      answeredBy: string | number | null
      answeredAt: string
    },
  ) => Promise<unknown>
  remove: (id: string | number) => Promise<unknown>
  /**
   * Fired after a successful write, with everything the withdrawal rule needs
   * (#436, type 5). The RULE is not here: `notifyWithdrawal`
   * (`src/lib/push/notify.ts`) decides whether this particular change is worth
   * a voditelj's phone, so the answer route stays a route.
   *
   * Awaited but never allowed to fail the answer: the row is already saved by
   * the time this runs, and a push service having a bad minute must not turn a
   * stored answer into a 500 the dancer will retry.
   */
  onAnswered?: (input: AnsweredEvent) => Promise<unknown>
  now?: () => Date
}

/** What happened, for whoever wants to notify about it. */
export interface AnsweredEvent {
  performance: AttendancePerformance
  memberId: string
  member: AttendanceMember | null
  previousStatus: AttendanceStatus | null
  nextStatus: AttendanceStatus | null
  /** True when the caller answered for their OWN Member row. */
  ownAnswer: boolean
  nowMs: number
}

export interface AnswerResult {
  status: number
  body:
    | { ok: true; status: 'coming' | 'not_coming' | null; army: Army | null }
    | { error: string }
}

export const ANSWER_ROUTE_ERRORS = {
  /** Cross-site or non-JSON. A real dancer never sees it; an attacker learns nothing. */
  rejected: 'Odgovor trenutno nije moguć.',
  badRequest: 'Nedostaju podaci o izvedbi ili moreškantu.',
  noPerformance: 'Ta izvedba ne postoji.',
  failed: 'Spremanje odgovora nije uspjelo. Pokušaj ponovno.',
} as const

function id(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

/**
 * POST /api/app/attendance.
 *
 * 403/415 when the request is cross-site or not JSON (see
 * `src/lib/app/request-guard.ts`), before any read or write;
 * 400 for a body that names no performance or member, or a request the rules
 * call nonsense; 403 for one the caller may not make; 200 with the answer as it
 * now stands, so the client can settle its optimistic highlight on the server's
 * word rather than on its own guess.
 */
export async function handleAttendanceAnswer(
  body: AnswerBody | null | undefined,
  deps: AnswerDeps,
): Promise<AnswerResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) {
    return { status: rejection.status, body: { error: ANSWER_ROUTE_ERRORS.rejected } }
  }

  const performanceId = id(body?.performanceId)
  const memberId = id(body?.memberId)
  if (!performanceId || !memberId) {
    return { status: 400, body: { error: ANSWER_ROUTE_ERRORS.badRequest } }
  }

  const performance = await deps.loadPerformance(performanceId)
  if (!performance) {
    return { status: 400, body: { error: ANSWER_ROUTE_ERRORS.noPerformance } }
  }

  const member = await deps.loadMember(memberId)
  const existing = await deps.findExisting(performanceId, memberId)

  const decision = decideAttendanceAnswer({
    actor: deps.actor,
    member,
    memberId,
    performance,
    request: body?.status as AnswerRequest,
    army: body?.army,
    existingArmy: existing?.army ?? null,
    hasExisting: existing != null,
    nowMs: (deps.now?.() ?? new Date()).getTime(),
  })

  if (!decision.ok) {
    return { status: decision.status, body: { error: decision.error } }
  }

  const nowMs = (deps.now?.() ?? new Date()).getTime()
  const ownAnswer = deps.actor.memberId != null && String(deps.actor.memberId) === memberId

  if (decision.op === 'clear') {
    if (existing) await deps.remove(existing.id)
    await announce(deps, {
      performance,
      memberId,
      member,
      previousStatus: existing?.status ?? null,
      nextStatus: null,
      ownAnswer,
      nowMs,
    })
    return { status: 200, body: { ok: true, status: null, army: null } }
  }

  const answeredAt = (deps.now?.() ?? new Date()).toISOString()
  const answeredBy = deps.actor.user
    ? ((deps.actor.user as { id?: string | number }).id ?? null)
    : null

  const patch = { status: decision.status, army: decision.army, answeredBy, answeredAt }

  if (existing) {
    await deps.update(existing.id, patch)
  } else {
    try {
      await deps.create({ performance: performanceId, member: memberId, ...patch })
    } catch (err) {
      // The find-then-create is not atomic, and the unique (performance,
      // member) index is what makes that safe rather than silently duplicating:
      // two taps in flight at once (a double tap, or the card and the detail
      // page open on two phones) mean the second create hits the index and
      // throws. That is a race, not a failure, so re-read once and update the
      // row the other write just made. A second failure is a real error.
      const raced = await deps.findExisting(performanceId, memberId)
      if (!raced) throw err
      await deps.update(raced.id, patch)
    }
  }

  await announce(deps, {
    performance,
    memberId,
    member,
    previousStatus: existing?.status ?? null,
    nextStatus: decision.status,
    ownAnswer,
    nowMs,
  })

  return { status: 200, body: { ok: true, status: decision.status, army: decision.army } }
}

/** The answer is stored; telling anyone about it is best effort by contract. */
async function announce(deps: AnswerDeps, event: AnsweredEvent): Promise<void> {
  if (!deps.onAnswered) return
  try {
    await deps.onAnswered(event)
  } catch (err) {
    console.error('[attendance] answer notification failed', err)
  }
}

/** Re-exported so the route file needs one import for the voditelj branch. */
export { isVoditelj }
