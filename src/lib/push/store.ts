// The SQL behind push (#431, #435).
//
// `push_subscriptions` and `performance_notifications` are RAW tables
// (db/schema/migrate-push.sql), not Payload collections, so this module is
// their only reader and writer: plain parameterised `pool.query` against the
// pool Payload already owns, exactly as `marketing/opt-out.ts` and the dispute
// claim do.
//
// The pool is passed in as a one-method `PushQuery` rather than a Payload
// instance, so every function here is callable from a route, from the cron job
// and from a probe script without dragging the CMS along.

import type { ScheduledNotificationType } from './schedule'

export interface PushQuery {
  (sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>
}

/** The pool Payload holds open, typed down to the one method we use. */
export function poolQuery(payload: unknown): PushQuery {
  const pool = (payload as { db?: { pool?: { query: PushQuery } } }).db?.pool
  if (!pool) throw new Error('No Postgres pool on the Payload instance')
  return (sql, params) => pool.query(sql, params ?? [])
}

/** Upsert one device. See `subscribe.ts` for why the key is the endpoint. */
export async function saveSubscription(
  query: PushQuery,
  row: { userId: string; endpoint: string; p256dh: string; auth: string; userAgent: string | null },
): Promise<void> {
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
           last_seen_at = now()`,
    [Number(row.userId), row.endpoint, row.p256dh, row.auth, row.userAgent],
  )
}

/** Delete one of this user's devices. Returns how many rows went (0 or 1). */
export async function removeSubscription(
  query: PushQuery,
  userId: string,
  endpoint: string,
): Promise<number> {
  const res = await query(
    `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [Number(userId), endpoint],
  )
  return res.rowCount ?? 0
}

/** The 404/410 cleanup: the row is gone for good. */
export async function removeSubscriptionById(query: PushQuery, id: string | number): Promise<void> {
  await query(`DELETE FROM push_subscriptions WHERE id = $1`, [Number(id)])
}

export interface StoredSubscription {
  id: number
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Every device of every listed user. */
export async function loadSubscriptions(
  query: PushQuery,
  userIds: readonly string[],
): Promise<StoredSubscription[]> {
  const ids = userIds.map(Number).filter((n) => Number.isFinite(n))
  if (ids.length === 0) return []
  const res = await query(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::int[])`,
    [ids],
  )
  return res.rows.map((r) => ({
    id: Number(r.id),
    userId: String(r.user_id),
    endpoint: String(r.endpoint),
    p256dh: String(r.p256dh),
    auth: String(r.auth),
  }))
}

/**
 * Member id → the user id of that dancer's login.
 *
 * `Users.member` is the link the invitation writes (#424). A Member without a
 * login simply has no entry, which is how a guest ends up counted in the
 * no-answer list and left out of the fan-out.
 */
export async function loadUserIdsByMember(
  query: PushQuery,
  memberIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = memberIds.map(Number).filter((n) => Number.isFinite(n))
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const res = await query(
    `SELECT id, member_id FROM users WHERE member_id = ANY($1::int[])`,
    [ids],
  )
  for (const row of res.rows) map.set(String(row.member_id), String(row.id))
  return map
}

/**
 * Every user holding `moreska`: the audience of the withdrawal notice (#436).
 *
 * Raw SQL rather than a Payload `find`, because `permissions` is a hasMany
 * select and lives in its own `users_permissions` table — `{ permissions: {
 * contains: 'moreska' } }` is not a query Payload's Postgres adapter expresses
 * over a join table the way this one line does. The vocabulary itself is still
 * `src/lib/access/permissions.ts`'s (CLAUDE.md hard rule: never re-type it);
 * `'moreska'` here is a VALUE of that enum, passed as a parameter.
 *
 * Nothing filters on "has a device": the sender loads subscriptions and a
 * voditelj without one simply contributes nothing to the fan-out.
 *
 * SHARED accounts are excluded (#441 review). `shared` is the marker of a login
 * several people use (ADR-0022) — the society's `member` account holds `moreska`
 * and lives on whatever phone last signed in, so a withdrawal notice addressed
 * to it would ring a device that belongs to nobody in particular.
 */
export async function loadVoditeljUserIds(query: PushQuery): Promise<string[]> {
  const res = await query(
    `SELECT DISTINCT up.parent_id
       FROM users_permissions up
       JOIN users u ON u.id = up.parent_id
      WHERE up.value = $1 AND u.shared IS NOT TRUE`,
    ['moreska'],
  )
  return res.rows.map((row) => String(row.parent_id))
}

/**
 * Atomically claim (performance, type): true when this caller won the insert.
 *
 * The dispute-claim pattern (`src/lib/dispute/handle-dispute.ts`). It MUST NOT
 * swallow its own error — an unreachable claim table has to fail the cron run
 * rather than let it send un-guarded.
 */
export async function claimNotification(
  query: PushQuery,
  performanceId: string,
  type: ScheduledNotificationType,
): Promise<boolean> {
  const res = await query(
    `INSERT INTO performance_notifications (performance_id, type)
     VALUES ($1, $2)
     ON CONFLICT (performance_id, type) DO NOTHING
     RETURNING id`,
    [Number(performanceId), type],
  )
  return res.rows.length > 0
}

/** Hand a claim back when the work threw, so the next run can redo it. */
export async function releaseNotification(
  query: PushQuery,
  performanceId: string,
  type: ScheduledNotificationType,
): Promise<void> {
  await query(
    `DELETE FROM performance_notifications WHERE performance_id = $1 AND type = $2`,
    [Number(performanceId), type],
  )
}

/** Record the outcome on a claim that is already taken. Cosmetic. */
export async function finalizeNotification(
  query: PushQuery,
  performanceId: string,
  type: ScheduledNotificationType,
  devices: number,
): Promise<void> {
  await query(
    `UPDATE performance_notifications SET devices = $3 WHERE performance_id = $1 AND type = $2`,
    [Number(performanceId), type, devices],
  )
}
