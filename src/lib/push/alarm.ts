// The alarm, sent by hand (#431) and by the clock (#435).
//
// `dispatchAlarm` is the shared core: count the armies, pick the audience, look
// up which of them own a login, send. The manual route and the cron job call it
// with the same deps, so "Sokoliću, fali nas!" cannot come to mean two
// different things depending on who pressed what — the only difference between
// the two callers is that the automatic one first asks whether an army is
// actually short (`anyArmyBelowThreshold`) and claims the performance.
//
// `handleManualAlarm` is the route half, in the `attendance/answer.ts` shape:
// the guard first, then the validation, then the work. No throttle at all
// (#430, story 23): a desperate evening is allowed two alarms, and the only
// person who can send one already holds `moreska`.
//
// Nothing here counts anything itself. `countArmies` is the single home of the
// counting rule and this module is one of its callers.

import { countArmies, type ArmyCount, type AttendanceRow } from '@/lib/attendance/army-count'
import type { AttendanceMember } from '@/lib/attendance/rules'
import { rejectAppRequest, type AppRequestMeta } from '@/lib/app/request-guard'
import { APP_STRINGS } from '@/lib/app/strings'
import { showStartMs } from '@/lib/show-time'
import {
  alarmRecipientMembers,
  buildAlarmMessage,
  toUserIds,
  type NotifiablePerformance,
} from './recipients'
import type { PushMessage, SendPushResult } from './send'

/** Everything the alarm needs to know about the evening. */
export interface AlarmPerformance extends NotifiablePerformance {
  cancelled: boolean
  thresholdCrni: number
  thresholdBili: number
}

export interface AlarmCoreDeps {
  loadAttendance: (performanceId: string) => Promise<AttendanceRow[]>
  /** Every ACTIVE moreškant, login or not: the roster the count is taken over. */
  loadMoreskanti: () => Promise<AttendanceMember[]>
  /** Member id → the user id of that dancer's login, for those who have one. */
  loadUserIdsByMember: (memberIds: readonly string[]) => Promise<Map<string, string>>
  send: (userIds: readonly string[], message: PushMessage) => Promise<SendPushResult>
  /** Injected clock: the alarm's TTL and the "already started" refusal read it. */
  now?: () => Date
}

export interface AlarmDispatch {
  count: ArmyCount
  /** Members the alarm was addressed to, login or not. */
  memberIds: string[]
  /** Those of them who have a login, so a device could exist. */
  userIds: string[]
  message: PushMessage
  result: SendPushResult
}

const NOTHING: SendPushResult = { recipients: 0, devices: 0, delivered: 0, dead: 0, failed: 0 }

/**
 * Read the answers and the roster ONCE and count them.
 *
 * Every caller goes through this rather than loading for itself, because the
 * cron's alarm asks the count two questions — "is an army short?" and "what does
 * the sentence say?" — and reading twice would let an answer landing between
 * them send a headcount that is not the one judged short (#440 review).
 */
export async function countForAlarm(
  performance: AlarmPerformance,
  deps: Pick<AlarmCoreDeps, 'loadAttendance' | 'loadMoreskanti'>,
): Promise<ArmyCount> {
  const [rows, members] = await Promise.all([
    deps.loadAttendance(performance.id),
    deps.loadMoreskanti(),
  ])
  return countArmies(rows, members, {
    crni: performance.thresholdCrni,
    bili: performance.thresholdBili,
  })
}

/**
 * Pick and send, over a count the caller may already hold.
 *
 * Returns the count as well, because both callers report it: the route to the
 * voditelj's screen, the cron to its JSON summary.
 */
export async function dispatchAlarm(
  performance: AlarmPerformance,
  options: { includeNotComing?: boolean },
  deps: AlarmCoreDeps,
  /** The count this run already took; omitted means "read it now". */
  precounted?: ArmyCount,
): Promise<AlarmDispatch> {
  const count = precounted ?? (await countForAlarm(performance, deps))
  const message = buildAlarmMessage(performance, count, (deps.now?.() ?? new Date()).getTime())
  const memberIds = alarmRecipientMembers(count, options)

  if (memberIds.length === 0) {
    return { count, memberIds, userIds: [], message, result: { ...NOTHING } }
  }

  const userIds = toUserIds(memberIds, await deps.loadUserIdsByMember(memberIds))
  if (userIds.length === 0) {
    return { count, memberIds, userIds, message, result: { ...NOTHING } }
  }

  return { count, memberIds, userIds, message, result: await deps.send(userIds, message) }
}

export interface ManualAlarmBody {
  performanceId?: unknown
  includeNotComing?: unknown
}

export interface ManualAlarmDeps extends AlarmCoreDeps {
  request: AppRequestMeta
  loadPerformance: (id: string) => Promise<AlarmPerformance | null>
}

export interface ManualAlarmResult {
  status: number
  body:
    | {
        ok: true
        /** Devices the alarm was attempted on. */
        devices: number
        /** Devices that actually took it: the number the page shows (story 24). */
        delivered: number
        /** People it was addressed to, whether or not they own a device. */
        people: number
        dead: number
      }
    | { error: string }
}

/** POST /api/app/alarm. `requirePermission(req, 'moreska')` is the route's job. */
export async function handleManualAlarm(
  body: ManualAlarmBody | null | undefined,
  deps: ManualAlarmDeps,
): Promise<ManualAlarmResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.push.rejected } }

  const performanceId =
    typeof body?.performanceId === 'string'
      ? body.performanceId.trim()
      : typeof body?.performanceId === 'number'
        ? String(body.performanceId)
        : ''
  if (!performanceId) return { status: 400, body: { error: APP_STRINGS.alarm.missing } }

  const performance = await deps.loadPerformance(performanceId)
  if (!performance) return { status: 400, body: { error: APP_STRINGS.alarm.missing } }

  // Two refusals, both of them "this alarm cannot mean anything any more".
  // A cancelled evening: "fali nas" about a performance that is not happening is
  // the opposite of informative. An evening that has already STARTED: #430's
  // story 20 is a rule about every notification, manual included — only
  // performances ahead of now (Zagreb time, `showStartMs`) ever trigger
  // anything, and a push queued at 21:05 for a 21:00 izvedba reaches a phone
  // when the answer it asks for is no longer possible.
  if (performance.cancelled) {
    return { status: 400, body: { error: APP_STRINGS.alarm.cancelled } }
  }

  const nowMs = (deps.now?.() ?? new Date()).getTime()
  const startMs = showStartMs(performance.date, performance.time)
  if (!Number.isNaN(startMs) && nowMs >= startMs) {
    return { status: 409, body: { error: APP_STRINGS.alarm.started } }
  }

  const dispatch = await dispatchAlarm(
    performance,
    { includeNotComing: body?.includeNotComing === true },
    deps,
  )

  return {
    status: 200,
    body: {
      ok: true,
      devices: dispatch.result.devices,
      delivered: dispatch.result.delivered,
      people: dispatch.memberIds.length,
      dead: dispatch.result.dead,
    },
  }
}
