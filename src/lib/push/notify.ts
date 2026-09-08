// The triggered notifications, wired but not IO'd (#436).
//
// Two entry points, one for each trigger:
//
//   - `notifyPerformanceSaved` is what the Shows `afterChange` hook calls, for a
//     create (type 4) and for an update (type 3) alike;
//   - `notifyWithdrawal` is what the attendance answer route calls (type 5).
//
// Everything here is DI'd over the deps `createPushDeps` already builds
// (`push-data.ts`), so the whole behaviour — who was picked, what was sent, and
// which claims were released — is asserted in `notify.test.ts` against fakes,
// with no Payload, no Postgres and no socket.
//
// NOTHING in this module is allowed to fail its caller. A hook that throws
// fails the SAVE, which would mean a voditelj cannot cancel a performance
// because a push service is down — exactly backwards. The two `notify*`
// functions therefore never throw: they catch, log and report. That is the same
// contract `recordCriticalEvent` has, and for the same reason (a reporting sink
// is not a guard).

import type { AttendanceRow } from '@/lib/attendance/army-count'
import type { AttendanceMember } from '@/lib/attendance/rules'
import {
  decidePerformanceNotification,
  toChangeSnapshot,
  type ChangedField,
  type ChangeSnapshot,
} from './performance-change'
import { changeRecipientMembers, toUserIds, type NotifiablePerformance } from './recipients'
import type { ScheduledNotificationType } from './schedule'
import type { PushMessage, SendPushResult } from './send'
import { buildWithdrawalMessage, isWithdrawal, type WithdrawalInput } from './withdrawal'

const NOTHING: SendPushResult = { recipients: 0, devices: 0, delivered: 0, dead: 0, failed: 0 }

/**
 * The claims a moved start invalidates.
 *
 * Both of them are keyed on (performance, type) and were taken against the OLD
 * start instant, so a performance moved from Tuesday to Friday would otherwise
 * never alarm again: the row says it was already done (#440 review, #436).
 */
export const CLAIMS_INVALIDATED_BY_A_MOVE: ScheduledNotificationType[] = ['alarm', 'reminder']

export interface NotifyDeps {
  /** Every ACTIVE moreškant, login or not. */
  loadMoreskanti: () => Promise<AttendanceMember[]>
  /** Every attendance row of one performance. */
  loadAttendance: (performanceId: string) => Promise<AttendanceRow[]>
  /** Member id → user id, for the dancers that own a login. */
  loadUserIdsByMember: (memberIds: readonly string[]) => Promise<Map<string, string>>
  /** Every user holding `moreska`. Their devices are found by the sender. */
  loadVoditeljUserIds: () => Promise<string[]>
  send: (userIds: readonly string[], message: PushMessage) => Promise<SendPushResult>
  /** Hand back a scheduled claim, so the cron can take it again. */
  release: (performanceId: string, type: ScheduledNotificationType) => Promise<void>
  now?: () => Date
}

export interface NotifyOutcome {
  kind: 'none' | 'created' | 'changed' | 'failed'
  changed: ChangedField[]
  /** True when the alarm/reminder claims were handed back. */
  claimsReleased: boolean
  result: SendPushResult
}

const NO_OUTCOME: NotifyOutcome = { kind: 'none', changed: [], claimsReleased: false, result: NOTHING }

/**
 * One save of a Shows row → at most one push to the roster.
 *
 * `previousDoc` is Payload's own previous document; `null` (or an `operation`
 * of `create`) means the row is new. The two consequences are independent: a
 * moved date releases the scheduled claims even when the performance is in the
 * past and nobody is notified at all.
 */
export async function notifyPerformanceSaved(
  input: {
    doc: Record<string, unknown>
    previousDoc?: Record<string, unknown> | null
    operation: 'create' | 'update'
  },
  deps: NotifyDeps,
): Promise<NotifyOutcome> {
  try {
    const next = toChangeSnapshot(input.doc)
    const previous =
      input.operation === 'create' || !input.previousDoc
        ? null
        : toChangeSnapshot(input.previousDoc)

    const nowMs = (deps.now?.() ?? new Date()).getTime()
    const decision = decidePerformanceNotification({ previous, next, nowMs })

    let claimsReleased = false
    if (decision.startMoved) {
      for (const type of CLAIMS_INVALIDATED_BY_A_MOVE) {
        await deps.release(next.id, type)
      }
      claimsReleased = true
    }

    if (decision.kind === 'none') {
      return { kind: 'none', changed: decision.changed, claimsReleased, result: NOTHING }
    }

    const userIds = await rosterUserIds(next, decision.kind === 'changed', deps)
    const result =
      userIds.length === 0 ? NOTHING : await deps.send(userIds, decision.message)

    return { kind: decision.kind, changed: decision.changed, claimsReleased, result }
  } catch (err) {
    // A save must never fail because a notification could not be worked out.
    console.error('[push] performance notification failed', err)
    return { ...NO_OUTCOME, kind: 'failed' }
  }
}

/**
 * The roster's user ids for one performance: every active moreškant with a
 * login, minus (for a change) the ones who said "ne dolazim".
 *
 * A dancer without a login simply has no user id, which is where a guest drops
 * out of the fan-out — the one place that happens is `toUserIds` (#431).
 */
async function rosterUserIds(
  performance: ChangeSnapshot,
  excludeNotComing: boolean,
  deps: NotifyDeps,
): Promise<string[]> {
  const members = await deps.loadMoreskanti()
  const memberIds = members.map((m) => String(m.id))

  const kept = excludeNotComing
    ? changeRecipientMembers(
        memberIds,
        (await deps.loadAttendance(performance.id))
          .filter((row) => row.status === 'not_coming')
          .map((row) => String(row.memberId)),
      )
    : [...new Set(memberIds)]

  if (kept.length === 0) return []
  return toUserIds(kept, await deps.loadUserIdsByMember(kept))
}

/**
 * A withdrawn "dolazim" → the voditelji (type 5).
 *
 * The rule is `isWithdrawal`, pure and tested on its own; this half only finds
 * the voditelji and posts. There is no claim and no throttle: two dancers
 * dropping out are two calls a voditelj has to make.
 */
export async function notifyWithdrawal(
  input: {
    performance: NotifiablePerformance
    who: { memberId: string; nickname: string | null; name?: string | null }
  } & WithdrawalInput,
  deps: Pick<NotifyDeps, 'loadVoditeljUserIds' | 'send'>,
): Promise<SendPushResult> {
  try {
    if (!isWithdrawal(input)) return NOTHING
    const userIds = await deps.loadVoditeljUserIds()
    if (userIds.length === 0) return NOTHING
    return await deps.send(
      userIds,
      buildWithdrawalMessage(input.performance, input.who, input.nowMs),
    )
  } catch (err) {
    // An answer is saved by the time we get here. Losing the notification is
    // bad; losing the answer would be worse.
    console.error('[push] withdrawal notification failed', err)
    return NOTHING
  }
}
