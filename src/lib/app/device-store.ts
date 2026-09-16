// The SQL behind `app_devices` (#652, ADR-0028).
//
// `app_devices` is a RAW table (db/schema/migrate-zz-dl-app-devices.sql), not a
// Payload collection, for the same reasons `push_subscriptions` is not
// (ADR-0024), so this module is its only reader and writer. The pool arrives as
// a one-method `PoolQuery` (`src/lib/db/pool-query.ts`) rather than as a Payload
// instance, the shape `src/lib/push/store.ts` established, so every function
// here is callable from a route or a probe script without dragging the CMS
// along.
//
// The rules — the cookie, the six-hour throttle, the three answers — are in
// `device.ts` and are pure. Nothing in this file decides anything.

import type { PoolQuery } from '@/lib/db/pool-query'
import { poolQuery as poolQueryOf } from '@/lib/db/pool-query'
import { NO_DEVICE_SIGNAL, type DeviceSignal } from './device'

export type { PoolQuery }

/** The pool Payload holds open, typed down to the one method we use. */
export const poolQuery: (payload: unknown) => PoolQuery = poolQueryOf

/** One browser's report, as the heartbeat route hands it over. */
export interface DeviceReport {
  deviceId: string
  userId: string | number
  /** What the browser said about itself right now. */
  standalone: boolean
  userAgent: string | null
}

function intOrNull(value: string | number): number | null {
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && Number.isInteger(n) ? n : null
}

/**
 * When did this device last report? `null` for a device with no row yet.
 *
 * The throttle is decided off this, on the server, before the browser is asked
 * to say anything — see `appDeviceHeartbeatDue` in `session-renewal-data.ts`.
 */
export async function loadDeviceLastSeen(
  query: PoolQuery,
  deviceId: string,
): Promise<Date | null> {
  const res = await query(`SELECT last_seen_at FROM app_devices WHERE device_id = $1`, [deviceId])
  const value = res.rows[0]?.last_seen_at
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Write down one browser. An upsert on `device_id`, and three details matter:
 *
 *  - **the row MOVES to the caller's account.** A dancer signing out of a
 *    shared phone and a voditelj signing in must leave one row belonging to the
 *    voditelj, exactly as `push_subscriptions` moves an endpoint. Two browsers
 *    on one account are still two rows, because they carry two different
 *    cookies — nothing here is keyed on the user.
 *  - **`standalone` ORs, it does not replace.** On Android an installed app and
 *    a plain tab share one cookie jar, so replacing would switch the mark off
 *    every time somebody opened a link from a message. The column means "this
 *    browser has reported itself installed", which is what it is named for in
 *    the migration.
 *  - **`first_seen_at` is never touched on conflict**, so the row keeps the day
 *    the browser first appeared.
 */
export async function recordDevice(query: PoolQuery, report: DeviceReport): Promise<void> {
  const userId = intOrNull(report.userId)
  if (userId === null) return
  await query(
    `INSERT INTO app_devices (device_id, user_id, standalone, user_agent)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (device_id) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           standalone = app_devices.standalone OR EXCLUDED.standalone,
           user_agent = COALESCE(EXCLUDED.user_agent, app_devices.user_agent),
           last_seen_at = now()`,
    [report.deviceId, userId, report.standalone, report.userAgent],
  )
}

/**
 * What the roster knows about a handful of accounts (#653 is the reader).
 *
 * Two grouped queries rather than a join: `app_devices` and
 * `push_subscriptions` count different things over the same ids, and joining
 * them would multiply one by the other — the revenue-join-inflation mistake in
 * miniature. An account with no rows in either is simply absent from the map,
 * and `NO_DEVICE_SIGNAL` is what the caller reads for it, which
 * `installedAnswer` then turns into `unknown`.
 */
export async function loadDeviceSignals(
  query: PoolQuery,
  userIds: readonly (string | number)[],
): Promise<Map<string, DeviceSignal>> {
  const map = new Map<string, DeviceSignal>()
  const ids = userIds.map(intOrNull).filter((n): n is number => n !== null)
  if (ids.length === 0) return map

  const touch = (userId: string): DeviceSignal => {
    const existing = map.get(userId)
    if (existing) return existing
    const fresh = { ...NO_DEVICE_SIGNAL }
    map.set(userId, fresh)
    return fresh
  }

  const devices = await query(
    `SELECT user_id,
            COUNT(*)::int AS devices,
            COUNT(*) FILTER (WHERE standalone)::int AS standalone_devices
       FROM app_devices
      WHERE user_id = ANY($1::int[])
      GROUP BY user_id`,
    [ids],
  )
  for (const row of devices.rows) {
    const signal = touch(String(row.user_id))
    signal.devices = Number(row.devices) || 0
    signal.standaloneDevices = Number(row.standalone_devices) || 0
  }

  const push = await query(
    `SELECT user_id, COUNT(*)::int AS push_devices
       FROM push_subscriptions
      WHERE user_id = ANY($1::int[])
      GROUP BY user_id`,
    [ids],
  )
  for (const row of push.rows) {
    touch(String(row.user_id)).pushDevices = Number(row.push_devices) || 0
  }

  return map
}
