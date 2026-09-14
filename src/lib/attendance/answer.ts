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
import { resolveUndo, stampWithdrawal, type WithdrawalStamps } from './withdrawal-stamp'
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
   * The answer that stands before this write. Read by `stampWithdrawal`
   * (#612): "a dolazim turned into anything else" is a fact about the PREVIOUS
   * row, and once the upsert has run it is unrecoverable.
   */
  status?: AttendanceStatus | null
  /** The odustajanje stamps as they stand (`./withdrawal-stamp.ts`). */
  stamps?: Partial<WithdrawalStamps>
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
  } & WithdrawalStamps) => Promise<unknown>
  update: (
    id: string | number,
    row: {
      status: 'coming' | 'not_coming'
      army: Army | null
      answeredBy: string | number | null
      answeredAt: string
    } & WithdrawalStamps,
  ) => Promise<unknown>
  remove: (id: string | number) => Promise<unknown>
  now?: () => Date
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

  /**
   * Un-tapping your own answer (#624), resolved into ONE of the two things this
   * handler already does.
   *
   * It is not a delete by default: a `dolazim` that stood past the grace window
   * is taken back rather than un-said, so the row survives as a `ne dolazim`
   * and the voditelj's Odustali list keeps the place it just lost. What this
   * branch decides is only WHICH of the two, because the withdrawal itself is
   * an ordinary `not_coming` write — it falls through to the write below and
   * gets its stamps from the same `stampWithdrawal` call every other answer
   * does, rather than a second copy of the patch here (#624 review).
   */
  let write: { status: AttendanceStatus; army: Army | null } | null =
    decision.op === 'write' ? { status: decision.status, army: decision.army } : null

  if (decision.op === 'undo') {
    if (!existing) return { status: 200, body: { ok: true, status: null, army: null } }

    const outcome = resolveUndo({
      previousStatus: existing.status ?? null,
      ownAnswer,
      nowMs,
      stamps: {
        confirmedAt: existing.stamps?.confirmedAt ?? null,
        withdrewAt: existing.stamps?.withdrewAt ?? null,
        withdrewOwn: existing.stamps?.withdrewOwn ?? null,
      },
    })

    if (outcome === 'delete') {
      await deps.remove(existing.id)
      return { status: 200, body: { ok: true, status: null, army: null } }
    }

    // An odustajanje cannot be un-tapped away: the row stands exactly as it is
    // and the answer comes back unchanged, so the red circle stays filled.
    if (outcome === 'keep') {
      return {
        status: 200,
        body: { ok: true, status: existing.status ?? null, army: existing.army ?? null },
      }
    }

    // The army is the one the row already carries: a withdrawal empties a place
    // in a column, and which column that was is not a thing the dancer chose.
    write = { status: 'not_coming', army: existing.army ?? null }
  }

  if (decision.op === 'clear') {
    // Clearing deletes the row, and the odustajanje stamps go with it. That is
    // the rule, not an oversight: "no answer" is the absence of a row, and a
    // dancer who takes their answer away entirely is back to never having said
    // anything (#612, Q2).
    if (existing) await deps.remove(existing.id)
    return { status: 200, body: { ok: true, status: null, army: null } }
  }

  // Unreachable: `clear` and `undo` have both returned or filled `write` above,
  // and every other decision is a write. Stated so the compiler knows it too.
  if (!write) return { status: 200, body: { ok: true, status: null, army: null } }

  const answeredAt = new Date(nowMs).toISOString()
  const answeredBy = deps.actor.user
    ? ((deps.actor.user as { id?: string | number }).id ?? null)
    : null

  // Odustajanje is decided from the row as it STANDS, before this write lands,
  // which is the only moment the previous answer still exists. A voditelj
  // writing on a dancer's behalf stamps it the same way a dancer does: the list
  // is a picture of who is missing, not of who did the typing (#612, Q18).
  const stamps = stampWithdrawal({
    previousStatus: existing?.status ?? null,
    nextStatus: write.status,
    confirmedAt: existing?.stamps?.confirmedAt ?? null,
    withdrewAt: existing?.stamps?.withdrewAt ?? null,
    withdrewOwn: existing?.stamps?.withdrewOwn ?? null,
    ownAnswer,
    nowMs,
  })

  const patch = { status: write.status, army: write.army, answeredBy, answeredAt, ...stamps }

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

  return { status: 200, body: { ok: true, status: write.status, army: write.army } }
}

/** Re-exported so the route file needs one import for the voditelj branch. */
export { isVoditelj }
