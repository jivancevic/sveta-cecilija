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
} from './rules'

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
}

export interface AnswerDeps {
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
  now?: () => Date
}

export interface AnswerResult {
  status: number
  body:
    | { ok: true; status: 'coming' | 'not_coming' | null; army: Army | null }
    | { error: string }
}

export const ANSWER_ROUTE_ERRORS = {
  badRequest: 'Nedostaju podaci o nastupu ili moreškantu.',
  noPerformance: 'Nastup ne postoji.',
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
 * 400 for a body that names no performance or member, or a request the rules
 * call nonsense; 403 for one the caller may not make; 200 with the answer as it
 * now stands, so the client can settle its optimistic highlight on the server's
 * word rather than on its own guess.
 */
export async function handleAttendanceAnswer(
  body: AnswerBody | null | undefined,
  deps: AnswerDeps,
): Promise<AnswerResult> {
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

  if (decision.op === 'clear') {
    if (existing) await deps.remove(existing.id)
    return { status: 200, body: { ok: true, status: null, army: null } }
  }

  const answeredAt = (deps.now?.() ?? new Date()).toISOString()
  const answeredBy = deps.actor.user
    ? ((deps.actor.user as { id?: string | number }).id ?? null)
    : null

  if (existing) {
    await deps.update(existing.id, {
      status: decision.status,
      army: decision.army,
      answeredBy,
      answeredAt,
    })
  } else {
    await deps.create({
      performance: performanceId,
      member: memberId,
      status: decision.status,
      army: decision.army,
      answeredBy,
      answeredAt,
    })
  }

  return { status: 200, body: { ok: true, status: decision.status, army: decision.army } }
}

/** Re-exported so the route file needs one import for the voditelj branch. */
export { isVoditelj }
