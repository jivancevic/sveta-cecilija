// Who gets an alarm or a reminder, and what it says (#431, #435).
//
// Pure over an `ArmyCount`, which is the ONLY place a headcount is ever
// computed (`src/lib/attendance/army-count.ts`): "3 bilih, 7 crnih" in a
// notification and "3/8" on the card are the same two numbers by construction,
// and the alarm states the current headcount, never the shortfall (glossary:
// *Alarm*).
//
// Recipients are MEMBER ids here and USER ids at the sender: a moreškant is a
// Member (ADR-0024) and only some Members have a login. A guest without one is
// correctly in the no-answer list, correctly in front of the voditelj's buttons,
// and correctly unreachable by push — `toUserIds` is the one place that drop
// happens, so nobody later mistakes a Member id for something a device can be
// found by.

import type { ArmyCount } from '@/lib/attendance/army-count'
import { PUSH_MESSAGES } from '@/lib/app/strings'
import { showStartMs } from '@/lib/show-time'
import type { PushMessage } from './send'

/**
 * How long a REMINDER may wait for an offline phone. Two days out, a night in a
 * tunnel changes nothing about whether the dancer still has to answer.
 */
export const REMINDER_TTL_SECONDS = 12 * 60 * 60

/** The floor for an alarm's TTL: a minute is long enough to reach a phone. */
export const MIN_ALARM_TTL_SECONDS = 60

/**
 * An alarm expires WITH THE PERFORMANCE it is about.
 *
 * A phone that comes back online after the evening has begun must not be handed
 * "fali nas" for a performance that is already dancing — the push service holds
 * a message for its whole TTL, so a flat twelve hours would do exactly that.
 */
export function alarmTtlSeconds(performance: NotifiablePerformance, nowMs: number): number {
  const start = showStartMs(performance.date, performance.time)
  if (Number.isNaN(start)) return MIN_ALARM_TTL_SECONDS
  return Math.max(MIN_ALARM_TTL_SECONDS, Math.floor((start - nowMs) / 1000))
}

/** The performance fields a notification names. */
export interface NotifiablePerformance {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, Europe/Zagreb wall clock. */
  time: string
}

/**
 * The alarm's audience: everyone who has not answered, plus — only when the
 * voditelj ticks the box (#430, story 22) — everyone who said "ne dolazim".
 * Someone who is already coming is never alarmed.
 */
export function alarmRecipientMembers(
  count: ArmyCount,
  options: { includeNotComing?: boolean } = {},
): string[] {
  const people = options.includeNotComing ? [...count.noAnswer, ...count.notComing] : count.noAnswer
  return [...new Set(people.map((p) => p.memberId))]
}

/** The reminder's audience: no answer, and nobody else (story 14). */
export function reminderRecipientMembers(count: ArmyCount): string[] {
  return [...new Set(count.noAnswer.map((p) => p.memberId))]
}

/**
 * Is an army short? The automatic alarm's whole condition (story 12): with both
 * armies at or above threshold the evening is covered and an alarm that fires
 * anyway is an alarm nobody reads next time.
 */
export function anyArmyBelowThreshold(count: ArmyCount): boolean {
  return count.crni.below || count.bili.below
}

/** Member ids → the user ids that actually own a device. */
export function toUserIds(
  memberIds: readonly string[],
  userIdByMemberId: ReadonlyMap<string, string>,
): string[] {
  const ids = memberIds
    .map((memberId) => userIdByMemberId.get(String(memberId)))
    .filter((userId): userId is string => typeof userId === 'string' && userId !== '')
  return [...new Set(ids)]
}

/** Where a tap lands: the performance the notification is about (story 6). */
export function performanceUrl(performanceId: string): string {
  return `/app/izvedba/${performanceId}`
}

export function buildAlarmMessage(
  performance: NotifiablePerformance,
  count: ArmyCount,
  nowMs: number = Date.now(),
): PushMessage {
  return {
    title: PUSH_MESSAGES.alarm.title,
    body: PUSH_MESSAGES.alarm.body({
      date: performance.date,
      time: performance.time,
      bili: count.bili.count,
      crni: count.crni.count,
    }),
    url: performanceUrl(performance.id),
    // One tag per performance and kind: a manual alarm sent twice in an hour
    // replaces itself on the lock screen instead of stacking, while the
    // reminder and the alarm remain two separate notifications.
    tag: `alarm-${performance.id}`,
    ttlSeconds: alarmTtlSeconds(performance, nowMs),
  }
}

export function buildReminderMessage(performance: NotifiablePerformance): PushMessage {
  return {
    title: PUSH_MESSAGES.reminder.title,
    body: PUSH_MESSAGES.reminder.body({ date: performance.date, time: performance.time }),
    url: performanceUrl(performance.id),
    tag: `reminder-${performance.id}`,
    ttlSeconds: REMINDER_TTL_SECONDS,
  }
}
