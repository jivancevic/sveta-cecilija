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
 * Count, pick, send. Returns the count as well, because both callers report it:
 * the route to the voditelj's screen, the cron to its JSON summary.
 */
export async function dispatchAlarm(
  performance: AlarmPerformance,
  options: { includeNotComing?: boolean },
  deps: AlarmCoreDeps,
): Promise<AlarmDispatch> {
  const [rows, members] = await Promise.all([
    deps.loadAttendance(performance.id),
    deps.loadMoreskanti(),
  ])

  const count = countArmies(rows, members, {
    crni: performance.thresholdCrni,
    bili: performance.thresholdBili,
  })
  const message = buildAlarmMessage(performance, count)
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

  // A cancelled evening is the one case a voditelj is refused: "fali nas" about
  // a performance that is not happening is the opposite of informative. A PAST
  // performance is deliberately NOT refused — unlike the automatic alarm, which
  // only ever looks ahead, the voditelj is standing there and is the judge of
  // whether the pier still needs people (#430, story 21).
  if (performance.cancelled) {
    return { status: 400, body: { error: APP_STRINGS.alarm.cancelled } }
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
