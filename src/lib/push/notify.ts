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
import { toPerformanceFacts, type PerformanceFacts } from '@/lib/app/performance-facts'
import { PUSH_MESSAGES } from '@/lib/app/strings'
import {
  decidePerformanceNotification,
  type ChangedField,
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
  /**
   * The DETACHED fan-out, or null when there was nothing to send.
   *
   * Nobody in production awaits it (see below); it is returned so a test can,
   * and so a caller that genuinely wants to wait — a script, a probe — has the
   * option. It never rejects: a failure is caught, logged and reported as a
   * result of zeros.
   */
  sending: Promise<SendPushResult> | null
}

const NO_OUTCOME: NotifyOutcome = { kind: 'none', changed: [], claimsReleased: false, sending: null }

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
  return notifyPerformanceFactsSaved(
    {
      next: toPerformanceFacts(input.doc),
      previous:
        input.operation === 'create' || !input.previousDoc
          ? null
          : toPerformanceFacts(input.previousDoc),
    },
    deps,
  )
}

/**
 * The same decision over facts already projected.
 *
 * The two admin actions that move a performance — the #379 reschedule and the
 * #94 venue move — write with raw SQL and never touch the collection, so no
 * hook fires for them (#441 review). They read the row before and after
 * themselves and call this.
 */
export async function notifyPerformanceFactsSaved(
  input: { previous: PerformanceFacts | null; next: PerformanceFacts },
  deps: NotifyDeps,
): Promise<NotifyOutcome> {
  try {
    const { next, previous } = input

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
      return { kind: 'none', changed: decision.changed, claimsReleased, sending: null }
    }

    // DETACHED, deliberately (#441 review). Payload runs `afterChange` inside
    // the save's transaction, so awaiting a fan-out here would hold that
    // transaction open for a round trip to FCM per device: an admin pressing
    // Save would wait for twenty phones. The claim release above is awaited
    // because it is one fast DELETE on the same connection and because a
    // release that silently did not happen is the very defect this fixes.
    const sending = detach(sendToRoster(next, decision.kind === 'changed', decision.message, deps))

    return { kind: decision.kind, changed: decision.changed, claimsReleased, sending }
  } catch (err) {
    // A save must never fail because a notification could not be worked out.
    console.error('[push] performance notification failed', err)
    return { ...NO_OUTCOME, kind: 'failed' }
  }
}

/** Swallow and log, so a detached send can never become an unhandled rejection. */
function detach(work: Promise<SendPushResult>): Promise<SendPushResult> {
  return work.catch((err) => {
    console.error('[push] fan-out failed', err)
    return NOTHING
  })
}

async function sendToRoster(
  performance: PerformanceFacts,
  excludeNotComing: boolean,
  message: PushMessage,
  deps: NotifyDeps,
): Promise<SendPushResult> {
  const userIds = await rosterUserIds(performance, excludeNotComing, deps)
  return userIds.length === 0 ? NOTHING : deps.send(userIds, message)
}

/**
 * The roster's user ids for one performance: every active moreškant with a
 * login, minus (for a change) the ones who said "ne dolazim".
 *
 * A dancer without a login simply has no user id, which is where a guest drops
 * out of the fan-out — the one place that happens is `toUserIds` (#431).
 */
async function rosterUserIds(
  performance: PerformanceFacts,
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
 * A bulk create → ONE notification (#441 review).
 *
 * `/api/shows/bulk-create` writes a season in a loop, and twenty-two "nova
 * izvedba" pushes is a phone buzzing for a minute about a schedule nobody has
 * to answer this instant. The loop sets `skipRosterPush` on the request context
 * so the hook stays quiet, and the route calls this once afterwards.
 *
 * The tap lands on `/app` rather than on a performance, because there is no one
 * performance this message is about.
 */
export async function notifyBulkCreated(
  input: { count: number; firstDate: string },
  deps: Pick<NotifyDeps, 'loadMoreskanti' | 'loadUserIdsByMember' | 'send'>,
): Promise<SendPushResult> {
  try {
    if (input.count <= 0) return NOTHING
    const members = await deps.loadMoreskanti()
    const memberIds = [...new Set(members.map((m) => String(m.id)))]
    if (memberIds.length === 0) return NOTHING
    const userIds = toUserIds(memberIds, await deps.loadUserIdsByMember(memberIds))
    if (userIds.length === 0) return NOTHING
    return await deps.send(userIds, {
      title: PUSH_MESSAGES.createdBulk.title,
      body: PUSH_MESSAGES.createdBulk.body(input),
      url: '/app',
      tag: `bulk-${input.firstDate}`,
      ttlSeconds: BULK_TTL_SECONDS,
    })
  } catch (err) {
    console.error('[push] bulk create notification failed', err)
    return NOTHING
  }
}

/** A season announcement can wait out a night in a tunnel; a week is plenty. */
export const BULK_TTL_SECONDS = 7 * 24 * 60 * 60

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
    who: { memberId: string; nickname: string | null }
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
