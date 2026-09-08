// One performance, in full (#423, ADR-0024 phase 3).
//
// The detail view answers one question a card cannot: are we short? So it is
// the army count (`src/lib/attendance/army-count.ts`) plus the people behind
// the numbers — nicknames per army, the bula, who said no, and who has not
// answered at all. The counting rule itself is NOT re-implemented here; this
// module loads the rows and hands them to the one function that owns it.
//
// The PII boundary of ADR-0024 lives in this file's shape: `RosterPerson`
// carries a nickname and a mobile and there is no email field to fill, so a
// dancer can call a friend and nothing else leaks. `toAttendanceMember` (in
// `attendance/rules.ts`, next to the type it builds) is an explicit projection,
// never a spread of the Payload doc.
//
// Read-only is a property of the VIEWER, not of the page: a moreškant looking
// back at last week sees the answers as they were, while a voditelj can still
// correct them (#419, story 13). Both see the same numbers.
//
// Pure + DI in the phase 2 loader style; `detail-data.ts` holds the Payload
// calls and nothing else.

import { countArmies, type ArmyCount, type AttendanceRow } from '@/lib/attendance/army-count'
import {
  allowedArmies,
  moreskantMayAnswer,
  toAttendanceMember,
  type Army,
  type AttendanceStatus,
} from '@/lib/attendance/rules'
import { relationIdString } from '@/lib/payload-relation'
import { toRosterPerformance, type RosterPerformance } from './roster-loaders'

export interface PerformanceDetail {
  performance: RosterPerformance
  count: ArmyCount
  /** True when the viewer holds `moreska`. */
  voditelj: boolean
  /**
   * True when the viewer may change ANY answer here (a voditelj, always). A
   * moreškant edits only their own, which `performance.canAnswer` decides.
   */
  canEditOthers: boolean
  /**
   * Whether the "Pošalji alarm" control belongs on this page (#431): a voditelj,
   * an evening that is neither cancelled nor already begun. The route refuses
   * the same two cases, so this only keeps the page from offering what the
   * server will decline — and it is decided HERE rather than in the component
   * because a `Date.now()` in render is an impure call the compiler rejects.
   */
  canAlarm: boolean
  /** The armies each coming dancer could be moved to. Only ever 0 or 2 entries. */
  moveTargets: Record<string, Army[]>
  /** The viewer's own Member, when they have one. */
  myMemberId: string | null
}

/** A Payload attendance doc → the flat row the count reads. */
export function toAttendanceRow(doc: Record<string, unknown>): AttendanceRow | null {
  const memberId = relationIdString(doc.member)
  if (!memberId) return null
  if (doc.status !== 'coming' && doc.status !== 'not_coming') return null
  return {
    memberId,
    status: doc.status as AttendanceStatus,
    army: doc.army === 'crni' || doc.army === 'bili' ? (doc.army as Army) : null,
  }
}

/**
 * Everything the detail page renders, from rows already loaded.
 *
 * `members` must be the ACTIVE moreškanti and nothing else — the no-answer list
 * is that roster minus everyone who answered, which is what puts a guest
 * without a login in front of the voditelj's buttons (#419, story 19).
 */
export function buildPerformanceDetail(input: {
  performanceDoc: Record<string, unknown>
  attendanceDocs: Record<string, unknown>[]
  memberDocs: Record<string, unknown>[]
  viewer: { memberId: string | null; voditelj: boolean }
  nowMs: number
}): PerformanceDetail {
  const performance = toRosterPerformance(input.performanceDoc)
  const members = input.memberDocs.map(toAttendanceMember)
  const rows = input.attendanceDocs
    .map(toAttendanceRow)
    .filter((r): r is AttendanceRow => r !== null)

  const count = countArmies(rows, members, {
    crni: performance.thresholdCrni,
    bili: performance.thresholdBili,
  })

  const myAnswer = input.viewer.memberId
    ? (rows.find((r) => r.memberId === input.viewer.memberId)?.status ?? null)
    : null

  const canAnswer =
    input.viewer.memberId != null &&
    (input.viewer.voditelj || moreskantMayAnswer(performance, input.nowMs))

  // Only a dancer who holds BOTH armies can be moved, which is the whole point
  // of the control (#419, story 12).
  const moveTargets: Record<string, Army[]> = {}
  for (const member of members) {
    const armies = allowedArmies(member)
    if (armies.length > 1) moveTargets[String(member.id)] = armies
  }

  const canAlarm =
    input.viewer.voditelj &&
    !performance.cancelled &&
    !Number.isNaN(performance.startMs) &&
    performance.startMs > input.nowMs

  return {
    performance: { ...performance, myAnswer, canAnswer },
    count,
    voditelj: input.viewer.voditelj,
    canEditOthers: input.viewer.voditelj,
    canAlarm,
    moveTargets,
    myMemberId: input.viewer.memberId,
  }
}

export interface PerformanceDetailDeps {
  /** Loads one shows doc by id, or null when there is none. */
  loadPerformance: (id: string) => Promise<Record<string, unknown> | null>
  /** Every attendance row for that performance. */
  loadAttendance: (performanceId: string) => Promise<Record<string, unknown>[]>
  /** Every ACTIVE moreškant, login or not. */
  loadMoreskanti: () => Promise<Record<string, unknown>[]>
  viewer: { memberId: string | null; voditelj: boolean }
  now?: () => Date
}

export async function loadPerformanceDetail(
  performanceId: string,
  deps: PerformanceDetailDeps,
): Promise<PerformanceDetail | null> {
  const performanceDoc = await deps.loadPerformance(performanceId)
  if (!performanceDoc) return null

  const [attendanceDocs, memberDocs] = await Promise.all([
    deps.loadAttendance(performanceId),
    deps.loadMoreskanti(),
  ])

  return buildPerformanceDetail({
    performanceDoc,
    attendanceDocs,
    memberDocs,
    viewer: deps.viewer,
    nowMs: (deps.now?.() ?? new Date()).getTime(),
  })
}
