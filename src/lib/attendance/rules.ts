// Who may answer what, for whom, and when (#422, ADR-0024 phase 3).
//
// One answer route serves two very different callers, so the rule set is the
// interesting part and it lives here, pure:
//
//   - a **moreškant** answers for exactly one person, themselves, and only
//     while the performance has not started. A cancelled evening takes no
//     answer at all — there is nothing to come to.
//   - a **voditelj** answers for anybody on the roster, at any time, cancelled
//     or long past, because the record has to be correctable (#419, story 13).
//     The army is the voditelj's alone: a dancer says "dolazim" and the
//     voditelj decides which army they dance in (glossary: *Attendance*).
//
// The army a new answer lands in comes from the member's PRIMARY role, never
// from a guess: `crni` / `crni_kralj` / `otmanovic` are crni, `bili` /
// `bili_kralj` are bili, a `bula` is in neither army and carries a null army.
//
// No IO here: the caller loads the performance, the member and any existing
// row and hands them over. `answer.ts` is the route half.

import { can, type PermissionUser } from '@/lib/access/permissions'
import { isDanceRole, isMoreskantRow, type DanceRole } from '@/lib/moreskant-profile'
import { APP_STRINGS } from '@/lib/app/strings'

/** The two armies. `null` is a bula, who dances in neither. */
export type Army = 'crni' | 'bili'

/** What a stored answer says. "No answer" is the absence of a row, not a value. */
export type AttendanceStatus = 'coming' | 'not_coming'

/** What the route accepts: an answer, or "forget my answer". */
export type AnswerRequest = AttendanceStatus | 'clear'

/** The dance roles that put a moreškant in each army. */
const ARMY_OF_ROLE: Record<DanceRole, Army | null> = {
  crni: 'crni',
  crni_kralj: 'crni',
  otmanovic: 'crni',
  bili: 'bili',
  bili_kralj: 'bili',
  bula: null,
}

export function isArmy(value: unknown): value is Army {
  return value === 'crni' || value === 'bili'
}

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return value === 'coming' || value === 'not_coming'
}

/** The member fields the rules reason about. Never an email (ADR-0024). */
export interface AttendanceMember {
  id: string
  /** The legal name. Only ever a fallback label; the app shows nicknames. */
  name?: string | null
  nickname?: string | null
  mobile?: string | null
  roles?: readonly string[]
  primaryRole?: string | null
  active?: boolean | null
  isMoreskant?: boolean | null
}

/**
 * A Payload members doc → the roster identity these rules and the army count
 * read. An explicit projection, never a spread: `members.email` exists since
 * #420 and must never reach an `/app` payload (ADR-0024's PII boundary is
 * mobiles yes, emails no), and there is no email field here to fill.
 */
export function toAttendanceMember(doc: Record<string, unknown>): AttendanceMember {
  return {
    id: String(doc.id),
    name: typeof doc.name === 'string' ? doc.name : null,
    nickname: typeof doc.nickname === 'string' ? doc.nickname : null,
    mobile: typeof doc.mobile === 'string' ? doc.mobile : null,
    roles: Array.isArray(doc.roles)
      ? (doc.roles.filter((r) => typeof r === 'string') as string[])
      : [],
    primaryRole: typeof doc.primaryRole === 'string' ? doc.primaryRole : null,
    active: doc.active !== false,
    isMoreskant: isMoreskantRow(doc),
  }
}

/** The performance fields the rules reason about. */
export interface AttendancePerformance {
  id: string
  /** Epoch ms of the start instant, Europe/Zagreb (`showStartMs`). */
  startMs: number
  cancelled: boolean
  /**
   * The raw YYYY-MM-DD / HH:MM the start was computed from. No rule in this
   * file reads them: they are here so the ONE object the answer route already
   * loads can also carry what a notification sentence says (#436), instead of
   * a second read of the same row.
   */
  date?: string
  time?: string
}

/** Who is asking. `memberId` is the actor's OWN Member link, if any. */
export interface AttendanceActor {
  user: PermissionUser
  memberId: string | null
}

/**
 * The army a member dances in by default: their primary role's army, falling
 * back to the first army their other roles allow (a profile saved before the
 * primary role became required, or a hand-edited row). A bula gets null.
 */
export function defaultArmyOf(member: AttendanceMember): Army | null {
  const primary = member.primaryRole
  if (isDanceRole(primary)) {
    const army = ARMY_OF_ROLE[primary]
    if (army) return army
    // An explicit `bula` primary role means "neither army", full stop.
    if (primary === 'bula') return null
  }
  for (const role of member.roles ?? []) {
    if (isDanceRole(role)) {
      const army = ARMY_OF_ROLE[role]
      if (army) return army
    }
  }
  return null
}

/**
 * The armies this member may be counted in — the set a voditelj may move them
 * to. A dancer holding both `crni` and `bili` is the case the move control in
 * the detail view exists for (#419, story 12).
 */
export function allowedArmies(member: AttendanceMember): Army[] {
  const out = new Set<Army>()
  for (const role of member.roles ?? []) {
    if (isDanceRole(role)) {
      const army = ARMY_OF_ROLE[role]
      if (army) out.add(army)
    }
  }
  return ['crni', 'bili'].filter((a): a is Army => out.has(a as Army))
}

/** True when the member row may take an answer at all: a live dancer. */
export function isAnswerableMember(member: AttendanceMember | null | undefined): boolean {
  if (!member) return false
  if (member.active === false) return false
  return member.isMoreskant === true
}

/** The id the request is about: the loaded Member's, or the raw one asked for. */
function memberIdOf(
  member: AttendanceMember | null | undefined,
  input: { memberId?: string | number | null },
): string {
  if (member?.id != null) return String(member.id)
  return input.memberId == null ? '' : String(input.memberId)
}

/**
 * True when a moreškant may still answer for themselves: the performance has
 * not started and has not been cancelled. The card reads this to decide whether
 * to render its buttons live or locked, so the lock a dancer SEES and the lock
 * the route ENFORCES are the same sentence.
 */
export function moreskantMayAnswer(
  performance: { startMs: number; cancelled: boolean },
  nowMs: number,
): boolean {
  return !performance.cancelled && nowMs < performance.startMs
}

/** True when the actor holds `moreska`: the voditelj branch of every rule. */
export function isVoditelj(actor: AttendanceActor): boolean {
  return can(actor.user, 'moreska')
}

export type AnswerDecision =
  | { ok: true; op: 'clear' }
  | { ok: true; op: 'write'; status: AttendanceStatus; army: Army | null }
  | { ok: false; status: 400 | 403; error: string }

/**
 * Croatian refusals; the only person who reads them is a dancer or a voditelj.
 *
 * `started` and `cancelled` are the very sentences the buttons show when they
 * render locked (`APP_STRINGS.answer`), not paraphrases of them: tapping a dead
 * button and having a POST refused are one situation, and a dancer should not
 * have to work out whether two wordings mean two rules.
 */
export const ANSWER_ERRORS = {
  notAllowed: 'Nemaš pravo odgovarati za ovog moreškanta.',
  notMoreskant: 'Taj član nije aktivan moreškant.',
  unknownStatus: 'Nepoznat odgovor.',
  started: APP_STRINGS.answer.locked,
  cancelled: APP_STRINGS.answer.cancelled,
  armyNotAllowed: 'Voditelj određuje vojsku.',
  armyNotInRoles: 'Taj moreškant ne pleše u toj vojsci.',
  unknownArmy: 'Nepoznata vojska.',
} as const

/**
 * THE answer rule (#422). Pure over (actor, member, performance, request).
 *
 * 403 means "you may not do this": someone else's answer, an evening that has
 * already started or been cancelled, or an army only a voditelj may set.
 * 400 means "this makes no sense": an unknown status or army, an army the
 * member's roles do not include, a member who is not a live moreškant.
 *
 * `existingArmy` is the army already stored for this pair, so an answer that
 * does not mention the army keeps the one the voditelj chose rather than
 * silently falling back to the primary role.
 */
export function decideAttendanceAnswer(input: {
  actor: AttendanceActor
  member: AttendanceMember | null | undefined
  /**
   * The Member id the caller asked about. Only needed when `member` is null (a
   * row that does not exist): the self-only check runs before the target is
   * inspected, so it needs the requested id, not the loaded one.
   */
  memberId?: string | number | null
  performance: AttendancePerformance
  request: unknown
  army?: unknown
  existingArmy?: Army | null
  hasExisting?: boolean
  nowMs: number
}): AnswerDecision {
  const { actor, member, performance, nowMs } = input
  const voditelj = isVoditelj(actor)

  if (!voditelj && !can(actor.user, 'moreskant')) {
    return { ok: false, status: 403, error: ANSWER_ERRORS.notAllowed }
  }

  // The self-only check comes FIRST for a dancer, before anything is asserted
  // about the target Member. Asking about a stranger's id must answer "not
  // yours" and nothing else: if the 400 "that member is not an active
  // moreškant" came first, a moreškant could walk the Members table and learn
  // who is on the roster by reading status codes.
  if (!voditelj && (!actor.memberId || String(actor.memberId) !== String(memberIdOf(member, input)))) {
    return { ok: false, status: 403, error: ANSWER_ERRORS.notAllowed }
  }

  if (!isAnswerableMember(member)) {
    return { ok: false, status: 400, error: ANSWER_ERRORS.notMoreskant }
  }
  const target = member as AttendanceMember

  if (!voditelj) {
    if (performance.cancelled) {
      return { ok: false, status: 403, error: ANSWER_ERRORS.cancelled }
    }
    if (!moreskantMayAnswer(performance, nowMs)) {
      return { ok: false, status: 403, error: ANSWER_ERRORS.started }
    }
  }

  const request = input.request
  if (request === 'clear') return { ok: true, op: 'clear' }
  if (!isAttendanceStatus(request)) {
    return { ok: false, status: 400, error: ANSWER_ERRORS.unknownStatus }
  }

  // The army: the voditelj's decision alone (glossary: *Attendance*).
  const armyGiven = input.army !== undefined && input.army !== null
  if (armyGiven) {
    if (!voditelj) return { ok: false, status: 403, error: ANSWER_ERRORS.armyNotAllowed }
    if (!isArmy(input.army)) return { ok: false, status: 400, error: ANSWER_ERRORS.unknownArmy }
    if (!allowedArmies(target).includes(input.army)) {
      return { ok: false, status: 400, error: ANSWER_ERRORS.armyNotInRoles }
    }
    return { ok: true, op: 'write', status: request, army: input.army }
  }

  const army = input.hasExisting ? (input.existingArmy ?? null) : defaultArmyOf(target)
  return { ok: true, op: 'write', status: request, army }
}
