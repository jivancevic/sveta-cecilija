// The scheduled half of the roster notifications (#435, ADR-0024 phase 4).
//
// Two jobs in one pass over the performances that are still ahead:
//
//   1. the ALARM, when an army is below threshold and the alarm time has come
//      (T-6h, or 18:00 the evening before for a morning performance);
//   2. the answer REMINDER at T-48h, to everyone who has not answered.
//
// The scheduler is Coolify's, running every fifteen minutes, so "exactly once
// per performance" cannot be a property of the schedule and has to be a
// property of the data. It is: `performance_notifications` holds one row per
// (performance, type) and the job CLAIMS it with
// `INSERT … ON CONFLICT DO NOTHING RETURNING id` — the dispute-claim pattern
// (`src/lib/dispute/handle-dispute.ts`), for the same reason spelled out there.
// Two runs racing in the same minute both call claim; exactly one gets a row
// back and sends. A check-then-act would have both read "not sent" and both
// ring twenty phones.
//
// The alarm is CLAIMED EVEN WHEN IT IS SKIPPED because both armies are at
// threshold (#435 acceptance criteria). That is the whole point of the rule: an
// evening judged covered at T-6h stays judged, so a single "ne dolazim" at
// T-5h cannot turn the alarm back on and ring everyone at midnight. A voditelj
// who disagrees has the manual alarm, which has no claim and no limit.
//
// A claim whose send then THROWS is released, so the next run can redo it —
// the same claim/release shape as the review-email cron. A send that merely
// reaches nobody is not a failure and keeps its claim: there was nothing to
// retry.
//
// Pure + DI over a fake clock, so the whole schedule is testable without a
// database, a socket or a Tuesday.

import { countArmies } from '@/lib/attendance/army-count'
import { dispatchAlarm, type AlarmCoreDeps, type AlarmPerformance } from './alarm'
import {
  anyArmyBelowThreshold,
  buildReminderMessage,
  reminderRecipientMembers,
  toUserIds,
} from './recipients'
import { isAlarmDue, isReminderDue, type ScheduledNotificationType } from './schedule'
import type { PushMessage, SendPushResult } from './send'

/** One candidate performance. Cancelled ones never reach this list. */
export type DuePerformance = AlarmPerformance

export interface RosterNotificationDeps extends AlarmCoreDeps {
  /**
   * Performances whose start is between now and now + LOOKAHEAD_MS, not
   * cancelled. Public and non-public alike: a ship call is an evening a dancer
   * has to turn up for (ADR-0024), so the roster jobs never filter on `public`.
   */
  loadDuePerformances: () => Promise<DuePerformance[]>
  /**
   * Atomically claim (performance, type). True when this run won the insert and
   * must do the work, false when a row already existed. MUST NOT swallow its
   * own errors: an unreachable claim table has to fail the run rather than let
   * it send un-guarded.
   */
  claim: (performanceId: string, type: ScheduledNotificationType) => Promise<boolean>
  /** Compensating delete for a claim whose work then threw. Best effort. */
  release: (performanceId: string, type: ScheduledNotificationType) => Promise<void>
  /** Records how many devices a claimed notification reached. Best effort. */
  finalize?: (
    performanceId: string,
    type: ScheduledNotificationType,
    devices: number,
  ) => Promise<void>
  now?: () => Date
}

export interface JobSummary {
  /** Performances whose window was open this run. */
  due: number
  /** Claims this run won. */
  claimed: number
  /** Claims that led to an actual send. */
  sent: number
  /** Claimed but deliberately not sent (no army short, or nobody to tell). */
  skipped: number
  /** Devices that took a message. */
  devices: number
  /** Dead endpoints cleaned up on the way. */
  dead: number
}

export interface RosterNotificationSummary {
  performances: number
  alarm: JobSummary
  reminder: JobSummary
  /** Performances whose work threw; their claims were released. */
  errors: number
}

function emptyJob(): JobSummary {
  return { due: 0, claimed: 0, sent: 0, skipped: 0, devices: 0, dead: 0 }
}

/**
 * One cron run.
 *
 * Never throws for one bad performance: the roster is twenty evenings and a
 * single broken row must not stop the other nineteen from being told.
 */
export async function runRosterNotifications(
  deps: RosterNotificationDeps,
): Promise<RosterNotificationSummary> {
  const nowMs = (deps.now?.() ?? new Date()).getTime()
  const performances = await deps.loadDuePerformances()

  const summary: RosterNotificationSummary = {
    performances: performances.length,
    alarm: emptyJob(),
    reminder: emptyJob(),
    errors: 0,
  }

  for (const performance of performances) {
    if (isReminderDue(performance, nowMs)) {
      summary.reminder.due++
      try {
        await runReminder(performance, deps, summary.reminder)
      } catch (err) {
        summary.errors++
        console.error('[roster-notifications] reminder', performance.id, err)
      }
    }

    if (isAlarmDue(performance, nowMs)) {
      summary.alarm.due++
      try {
        await runAlarm(performance, deps, summary.alarm)
      } catch (err) {
        summary.errors++
        console.error('[roster-notifications] alarm', performance.id, err)
      }
    }
  }

  return summary
}

async function runAlarm(
  performance: DuePerformance,
  deps: RosterNotificationDeps,
  job: JobSummary,
): Promise<void> {
  // The CLAIM COMES FIRST, before the threshold question, and that ordering is
  // the rule rather than an accident (#435): the alarm is claimed even when it
  // is skipped because both armies are covered, so an evening judged covered at
  // T-6h stays judged and one late "ne dolazim" cannot ring twenty phones at
  // midnight. A voditelj who disagrees has the manual alarm.
  if (!(await deps.claim(performance.id, 'alarm'))) return
  job.claimed++

  try {
    const [rows, members] = await Promise.all([
      deps.loadAttendance(performance.id),
      deps.loadMoreskanti(),
    ])
    const count = countArmies(rows, members, {
      crni: performance.thresholdCrni,
      bili: performance.thresholdBili,
    })
    if (!anyArmyBelowThreshold(count)) {
      job.skipped++
      await finalize(deps, performance.id, 'alarm', 0)
      return
    }

    const dispatch = await dispatchAlarm(performance, { includeNotComing: false }, deps)
    if (dispatch.userIds.length === 0) {
      job.skipped++
    } else {
      job.sent++
      job.devices += dispatch.result.delivered
      job.dead += dispatch.result.dead
    }
    await finalize(deps, performance.id, 'alarm', dispatch.result.delivered)
  } catch (err) {
    await releaseQuietly(deps, performance.id, 'alarm')
    throw err
  }
}

async function runReminder(
  performance: DuePerformance,
  deps: RosterNotificationDeps,
  job: JobSummary,
): Promise<void> {
  if (!(await deps.claim(performance.id, 'reminder'))) return
  job.claimed++

  try {
    const result = await sendReminder(performance, deps)
    if (result === null) {
      job.skipped++
      await finalize(deps, performance.id, 'reminder', 0)
      return
    }
    job.sent++
    job.devices += result.delivered
    job.dead += result.dead
    await finalize(deps, performance.id, 'reminder', result.delivered)
  } catch (err) {
    await releaseQuietly(deps, performance.id, 'reminder')
    throw err
  }
}

/** Null when there was nobody with a login to remind. */
async function sendReminder(
  performance: DuePerformance,
  deps: RosterNotificationDeps,
): Promise<SendPushResult | null> {
  const [rows, members] = await Promise.all([
    deps.loadAttendance(performance.id),
    deps.loadMoreskanti(),
  ])
  const count = countArmies(rows, members, {
    crni: performance.thresholdCrni,
    bili: performance.thresholdBili,
  })
  const memberIds = reminderRecipientMembers(count)
  if (memberIds.length === 0) return null

  const userIds = toUserIds(memberIds, await deps.loadUserIdsByMember(memberIds))
  if (userIds.length === 0) return null

  const message: PushMessage = buildReminderMessage(performance)
  return deps.send(userIds, message)
}

async function finalize(
  deps: RosterNotificationDeps,
  performanceId: string,
  type: ScheduledNotificationType,
  devices: number,
): Promise<void> {
  try {
    await deps.finalize?.(performanceId, type, devices)
  } catch {
    // Bookkeeping only: the phones already rang.
  }
}

async function releaseQuietly(
  deps: RosterNotificationDeps,
  performanceId: string,
  type: ScheduledNotificationType,
): Promise<void> {
  try {
    await deps.release(performanceId, type)
  } catch (err) {
    // Never mask the original failure with the compensation's.
    console.error('[roster-notifications] release failed', performanceId, type, err)
  }
}
