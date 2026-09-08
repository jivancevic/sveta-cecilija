// The IO wiring for push (#431, #435) — the `detail-data.ts` shape.
//
// Everything that needs a Payload instance or a socket lives here, so the
// rules, the fan-out and the schedule stay pure and testable. Two kinds of read
// meet in this file and they are deliberately different:
//
//   - the roster reads (attendance rows, active moreškanti, one performance)
//     go through Payload's local API, exactly as `/app`'s own loaders do;
//   - the push tables and the candidate-performance sweep are raw SQL, because
//     `push_subscriptions` / `performance_notifications` are not collections at
//     all and because "which performances start in the next 49 hours" is a
//     Europe/Zagreb timestamp comparison Postgres does in one line and Payload
//     cannot express against a `date` + `HH:MM` pair.
//
// The local API runs `overrideAccess: true`, so collection access scopes none
// of this. The callers are a `moreska` route and a `CRON_SECRET` job; roster
// visibility is society-wide by decision (ADR-0024).

import type { AttendanceRow } from '@/lib/attendance/army-count'
import { toAttendanceMember, type AttendanceMember } from '@/lib/attendance/rules'
import { toAttendanceRow } from '@/lib/app/detail-loaders'
import { toIsoDate } from '@/lib/to-iso-date'
import type { AlarmPerformance } from './alarm'
import type { DuePerformance } from './roster-notifications'
import { LOOKAHEAD_MS } from './schedule'
import {
  claimNotification,
  finalizeNotification,
  loadSubscriptions,
  loadUserIdsByMember,
  poolQuery,
  releaseNotification,
  removeSubscriptionById,
  type PushQuery,
} from './store'
import { sendPushToUsers, type PushMessage, type SendPushResult } from './send'
import { createWebPushPoster } from './web-push-poster'
import { vapidConfig } from './vapid'

/** Payload's local API, narrowed to the three calls this module makes. */
export interface PushPayload {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  findByID: (args: Record<string, unknown>) => Promise<unknown>
}

function threshold(value: unknown, fallback = 8): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** One `shows` doc → the fields an alarm reasons about. */
export function toAlarmPerformance(doc: Record<string, unknown>): AlarmPerformance {
  return {
    id: String(doc.id),
    date: toIsoDate(doc.date),
    time: typeof doc.time === 'string' ? doc.time : '',
    cancelled: doc.status === 'cancelled',
    thresholdCrni: threshold(doc.thresholdCrni),
    thresholdBili: threshold(doc.thresholdBili),
  }
}

export async function loadPerformanceForAlarm(
  payload: PushPayload,
  id: string,
): Promise<AlarmPerformance | null> {
  try {
    const doc = (await payload.findByID({
      collection: 'shows',
      id,
      depth: 0,
      overrideAccess: true,
    })) as Record<string, unknown> | null
    return doc ? toAlarmPerformance(doc) : null
  } catch {
    // A bad id is a 400 from the handler, never a 500 from here.
    return null
  }
}

export async function loadAttendanceRows(
  payload: PushPayload,
  performanceId: string,
): Promise<AttendanceRow[]> {
  const result = await payload.find({
    collection: 'attendance',
    where: { performance: { equals: performanceId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  return (result.docs as Record<string, unknown>[])
    .map(toAttendanceRow)
    .filter((row): row is AttendanceRow => row !== null)
}

/** Every ACTIVE moreškant, login or not: the roster a count is taken over. */
export async function loadActiveMoreskanti(payload: PushPayload): Promise<AttendanceMember[]> {
  const result = await payload.find({
    collection: 'members',
    where: { and: [{ isMoreskant: { equals: true } }, { active: { not_equals: false } }] },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  return (result.docs as Record<string, unknown>[]).map(toAttendanceMember)
}

/**
 * Performances that could have something due in this run: still ahead, not
 * cancelled, starting within the lookahead.
 *
 * A prefilter and nothing more — `isAlarmDue` / `isReminderDue` decide what is
 * actually due, so the window only has to be generous enough not to miss
 * anything. The Zagreb arithmetic is Postgres's, the same expression the
 * review-email cron uses, because a `date` column plus an `HH:MM` string is not
 * an instant until a zone is applied to it.
 */
export async function loadDuePerformances(
  query: PushQuery,
  nowMs: number,
): Promise<DuePerformance[]> {
  const res = await query(
    `SELECT id, date, time, status, threshold_crni, threshold_bili
       FROM shows
      WHERE status IS DISTINCT FROM 'cancelled'
        AND time IS NOT NULL
        AND ((date::date)::text || ' ' || time)::timestamp AT TIME ZONE 'Europe/Zagreb'
              BETWEEN $1 AND $2`,
    [new Date(nowMs).toISOString(), new Date(nowMs + LOOKAHEAD_MS).toISOString()],
  )
  return res.rows.map((row) => ({
    id: String(row.id),
    date: toIsoDate(row.date),
    time: String(row.time ?? ''),
    cancelled: row.status === 'cancelled',
    thresholdCrni: threshold(Number(row.threshold_crni)),
    thresholdBili: threshold(Number(row.threshold_bili)),
  }))
}

/**
 * A sender bound to this deployment's VAPID keys, or one that reports "nothing
 * sent" when push is not configured.
 *
 * Missing keys are a deployment state, not an error: a developer without them
 * still gets a working `/app`, and a voditelj pressing the alarm gets an honest
 * "0 uređaja" rather than a 500.
 */
export function createSender(
  query: PushQuery,
): (userIds: readonly string[], message: PushMessage) => Promise<SendPushResult> {
  const config = vapidConfig()
  if (!config) {
    return async () => ({ recipients: 0, devices: 0, delivered: 0, dead: 0, failed: 0 })
  }
  const post = createWebPushPoster(config)
  return (userIds, message) =>
    sendPushToUsers(userIds, message, {
      loadSubscriptions: (ids) => loadSubscriptions(query, ids),
      post,
      removeSubscription: (id) => removeSubscriptionById(query, id),
    })
}

/** The deps both the manual alarm and the cron job share. */
export function createPushDeps(payload: PushPayload) {
  const query = poolQuery(payload)
  return {
    query,
    loadAttendance: (performanceId: string) => loadAttendanceRows(payload, performanceId),
    loadMoreskanti: () => loadActiveMoreskanti(payload),
    loadUserIdsByMember: (memberIds: readonly string[]) => loadUserIdsByMember(query, memberIds),
    send: createSender(query),
    claim: (performanceId: string, type: string) => claimNotification(query, performanceId, type),
    release: (performanceId: string, type: string) =>
      releaseNotification(query, performanceId, type),
    finalize: (performanceId: string, type: string, devices: number) =>
      finalizeNotification(query, performanceId, type, devices),
  }
}
