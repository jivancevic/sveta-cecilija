// When the scheduled notifications are due (#435, ADR-0024 phase 4).
//
// Pure functions over a fake clock: every rule below is a number derived from a
// performance's own start instant, so the whole timing story is table-tested in
// `schedule.test.ts` without a cron, a database or a real Tuesday.
//
// Two windows, both half-open on the right at the performance's START:
//
//   - The ALARM is due from T-6h, except for a performance starting before
//     14:00 Zagreb, where T-6h would ring at seven in the morning: those alarm
//     at 18:00 the evening BEFORE, when a dancer can still rearrange a day
//     (#430, story 9).
//   - The REMINDER is due from T-48h (story 13).
//
// "Only while the performance is still ahead" (story 20) is the right edge of
// both windows and is checked here rather than by the caller, so a job that has
// not run for a week cannot ring anyone about last Tuesday.
//
// EVERY conversion goes through `zagrebWallClockMs` (`src/lib/zagreb-time.ts`),
// never a fixed +02:00. Only the T-6h branch is offset-free (six hours is six
// hours whatever the zone); "18:00 the day before" is a WALL CLOCK reading, so
// on the October switch weekend it has to resolve at +01:00, and the "starts
// before 14:00" test is a reading of the stored Zagreb wall clock too.

import { showStartMs } from '@/lib/show-time'
import { zagrebWallClockMs } from '@/lib/zagreb-time'

/** How long before the start a normal (evening) performance alarms. */
export const ALARM_LEAD_MS = 6 * 60 * 60 * 1000

/** How long before the start the answer reminder goes out. */
export const REMINDER_LEAD_MS = 48 * 60 * 60 * 1000

/**
 * How long the reminder stays claimable after T-48h.
 *
 * The reminder window CLOSES, unlike the alarm's, and that is a decision rather
 * than an omission (#435). "Javi dolazak, izvedba je za dva dana" is a sentence
 * about two days from now: left open until the start it would also fire six
 * hours before, on top of the alarm, and a performance entered at the last
 * minute would greet the roster with a reminder about an evening that is nearly
 * over. A whole day of slack is far more than a job running every fifteen
 * minutes needs; an evening that slips past it is covered by the alarm, which
 * is the notification that actually matters when time is short.
 */
export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * A performance starting before this hour (Europe/Zagreb wall clock) alarms the
 * evening before instead of six hours ahead.
 */
export const MORNING_CUTOFF_HOUR = 14

/** The wall-clock hour the evening-before alarm goes out. */
export const EVENING_BEFORE_TIME = '18:00'

/** The two scheduled notification kinds; also the claim table's `type`. */
export type ScheduledNotificationType = 'alarm' | 'reminder'

/** The only thing the timing rules need to know about a performance. */
export interface ScheduledPerformance {
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, Europe/Zagreb wall clock. */
  time: string
}

/** "2026-08-05" → "2026-08-04". Parsed at UTC noon so no zone shifts the day. */
export function previousDay(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return date
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * True when the stored wall clock reads before 14:00.
 *
 * A missing or malformed time is FALSE, not "before 14:00": an unreadable row
 * should fall through to the plain T-6h branch, which then resolves to NaN and
 * is never due, rather than quietly claim an 18:00 slot of its own.
 */
export function startsBeforeCutoff(time: string): boolean {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim())
  if (!match) return false
  return Number(match[1]) * 60 + Number(match[2]) < MORNING_CUTOFF_HOUR * 60
}

/**
 * Epoch ms at which the automatic alarm for this performance becomes due.
 *
 * NaN when the performance carries no usable date/time, which every caller
 * below turns into "never due" rather than into a throw: a half-entered row in
 * `/admin` must not take the cron job down for the whole roster.
 */
export function alarmTimeMs(performance: ScheduledPerformance): number {
  const start = showStartMs(performance.date, performance.time)
  if (Number.isNaN(start)) return Number.NaN
  if (!startsBeforeCutoff(performance.time)) return start - ALARM_LEAD_MS
  return zagrebWallClockMs(previousDay(performance.date), EVENING_BEFORE_TIME)
}

/** Epoch ms at which the T-48h answer reminder becomes due. */
export function reminderTimeMs(performance: ScheduledPerformance): number {
  const start = showStartMs(performance.date, performance.time)
  return Number.isNaN(start) ? Number.NaN : start - REMINDER_LEAD_MS
}

function due(at: number, startMs: number, nowMs: number): boolean {
  if (Number.isNaN(at) || Number.isNaN(startMs)) return false
  return nowMs >= at && nowMs < startMs
}

/** Due, and the performance has not started yet. */
export function isAlarmDue(performance: ScheduledPerformance, nowMs: number): boolean {
  return due(alarmTimeMs(performance), showStartMs(performance.date, performance.time), nowMs)
}

/** Due, within the reminder's own window, and the performance is still ahead. */
export function isReminderDue(performance: ScheduledPerformance, nowMs: number): boolean {
  const at = reminderTimeMs(performance)
  const start = showStartMs(performance.date, performance.time)
  if (!due(at, start, nowMs)) return false
  return nowMs < at + REMINDER_WINDOW_MS
}

/**
 * How far ahead the cron job has to look for work.
 *
 * The earliest thing it ever sends is the T-48h reminder, so a performance
 * further out than that has nothing due; the window is stated once here so the
 * SQL that loads candidates and the rules that filter them cannot drift apart.
 * A little slack over 48h costs one extra row per run and covers a job that
 * starts a few minutes late.
 */
export const LOOKAHEAD_MS = REMINDER_LEAD_MS + 60 * 60 * 1000
