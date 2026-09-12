// The SQL behind the Sandučić obavijesti (#496).
//
// `app_notifications` is a RAW table (db/schema/migrate-zz-dd-app-notifications.sql),
// not a Payload collection, for the same reasons `push_subscriptions` is not
// (ADR-0024): nobody ever edits a notification in the Backoffice, the rows are
// written by senders rather than by a person, and the one query that matters —
// "how many has this account not read" — is a partial-index count Postgres does
// in microseconds. So this module is the table's only reader and writer.
//
// The pool arrives as a one-method `PoolQuery` (`src/lib/db/pool-query.ts`)
// rather than as a Payload instance, so every function here is callable from a
// route, from the cron job and from a probe script without dragging the CMS
// along — the shape `src/lib/push/store.ts` established.
//
// TWO invariants live in this file and nowhere else:
//
//   - **Every statement is scoped to one account.** The inbox is per account
//     (not per device, not per Member), and a read or a mark that forgot its
//     `user_id` would hand one person another's rows. `markNotificationRead`
//     therefore carries the account in its WHERE rather than trusting the id.
//   - **Ids reach Postgres as integers.** `users.id` is a serial and so is this
//     table's key; an id that is not a number is dropped here rather than
//     turned into a NULL row or a cast error at the database.

import type { PoolQuery } from '@/lib/db/pool-query'
import { poolQuery as poolQueryOf } from '@/lib/db/pool-query'
import type { AppNotificationKind } from './notification-audience'

export type { PoolQuery }

/** The pool Payload holds open, typed down to the one method we use. */
export const poolQuery: (payload: unknown) => PoolQuery = poolQueryOf

/**
 * How many rows one screen of the inbox holds.
 *
 * There is no "load more" and that is deliberate: a notification is news, and
 * news older than the last fifty things that happened to a 25-evening season is
 * not what the screen is for. The rows are never deleted, so an older one is
 * still there for a query when anybody ever needs it.
 */
export const NOTIFICATION_PAGE_SIZE = 50

/** One filed notification, as the inbox screen reads it. */
export interface AppNotification {
  id: string
  kind: AppNotificationKind | string
  title: string
  body: string
  /** Where a tap lands. Always an internal `/app…` path. */
  url: string
  /** ISO 8601 UTC. */
  createdAt: string
  /** ISO 8601 UTC, or null while it is unread. */
  readAt: string | null
}

/**
 * A serial id, or null when the caller handed us something unusable.
 *
 * The empty string is explicitly out: `Number('')` is 0, which is a valid
 * integer and a row nobody owns, so a missing id would silently become a query
 * against account zero.
 */
function intOrNull(value: string | number): number | null {
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && Number.isInteger(n) ? n : null
}

/**
 * Raw pg hands a `timestamptz` back as a Date (project memory: pg date
 * columns), and the row crosses a server/client boundary, so it is normalised
 * to an ISO string here rather than in three components.
 */
function isoOrNull(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export interface NotificationDraft {
  /** The accounts to file it for, already resolved (see `notification-audience.ts`). */
  userIds: readonly (string | number)[]
  kind: AppNotificationKind
  title: string
  body: string
  url: string
}

/**
 * File one notification for a set of accounts. Returns how many rows landed.
 *
 * ONE statement for the whole audience rather than a loop: a roster fan-out is
 * twenty accounts, and twenty round trips inside a Payload `afterChange` hook
 * would hold the save's transaction open for all of them.
 */
export async function insertNotifications(
  query: PoolQuery,
  draft: NotificationDraft,
): Promise<number> {
  const ids = [...new Set(draft.userIds.map(intOrNull).filter((n): n is number => n !== null))]
  if (ids.length === 0) return 0

  const res = await query(
    `INSERT INTO app_notifications (user_id, kind, title, body, url)
     SELECT u, $2, $3, $4, $5 FROM unnest($1::int[]) AS u
     RETURNING id`,
    [ids, draft.kind, draft.title, draft.body, draft.url],
  )
  return res.rowCount ?? res.rows.length
}

/** One account's inbox, newest first. */
export async function listNotifications(
  query: PoolQuery,
  userId: string | number,
  limit = NOTIFICATION_PAGE_SIZE,
): Promise<AppNotification[]> {
  const account = intOrNull(userId)
  if (account === null) return []

  const res = await query(
    `SELECT id, kind, title, body, url, created_at, read_at
       FROM app_notifications
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [account, limit],
  )
  return res.rows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    url: String(row.url ?? '/app'),
    createdAt: isoOrNull(row.created_at) ?? new Date(0).toISOString(),
    readAt: isoOrNull(row.read_at),
  }))
}

/** The number behind the bell. Per account, so phone and laptop agree. */
export async function unreadNotificationCount(
  query: PoolQuery,
  userId: string | number,
): Promise<number> {
  const account = intOrNull(userId)
  if (account === null) return 0

  const res = await query(
    `SELECT count(*)::int AS n FROM app_notifications WHERE user_id = $1 AND read_at IS NULL`,
    [account],
  )
  const n = Number(res.rows[0]?.n ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Mark one row read. True when the row is this account's.
 *
 * `COALESCE(read_at, now())` rather than a plain `now()`: opening a row a second
 * time must not move the timestamp, and the answer must still be "yes, it is
 * yours" so the screen can follow the row's url. The account is in the WHERE,
 * which is what stops an id from another person's inbox being marked (or even
 * confirmed to exist).
 */
export async function markNotificationRead(
  query: PoolQuery,
  userId: string | number,
  id: string | number,
): Promise<boolean> {
  const account = intOrNull(userId)
  const row = intOrNull(id)
  if (account === null || row === null) return false

  const res = await query(
    `UPDATE app_notifications
        SET read_at = COALESCE(read_at, now())
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [row, account],
  )
  return res.rows.length > 0
}

/** "Označi sve pročitanim". Returns how many rows it actually cleared. */
export async function markAllNotificationsRead(
  query: PoolQuery,
  userId: string | number,
): Promise<number> {
  const account = intOrNull(userId)
  if (account === null) return 0

  const res = await query(
    `UPDATE app_notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [account],
  )
  return res.rowCount ?? 0
}
