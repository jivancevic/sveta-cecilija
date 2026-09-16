// The SQL behind the three marks on Članovi (#653, ADR-0028).
//
// Two tables that are nobody's collection and one column that is hidden from
// every collection read, so this is raw SQL through the pool Payload already
// holds open — the `device-store.ts` shape, and the same `PoolQuery` seam, so a
// probe script can ask the same question without dragging the CMS along. The
// RULES are `member-marks.ts` and are pure; nothing here decides anything.
//
// **This file is the one place allowed to ask whether a login carries an
// address, and it answers with a boolean.** The roster's PII scan
// (`own-access-pii.test.ts`) forbids the word on every file of the roster
// stack, `repo/payload/members.ts` included, precisely so that no address can
// travel; the scan cannot express "as a yes-or-no", so the boundary is drawn
// here instead, in a module whose return type has no room for one. Nothing
// above it is ever handed a string.
//
// `users.sessions` is read from `users_sessions`, Payload's own array table for
// that field: `addSessionToUser` appends a row on every sign-in and
// `logoutOperation` deletes one on "Odjava". It is hidden from an ordinary
// `find` because it is an auth field, which is why this is SQL and not the
// local API.

import type { PoolQuery } from '@/lib/db/pool-query'
import { NO_DEVICE_SIGNAL } from './device'
import { loadDeviceSignals } from './device-store'
import type { MemberAccountSignal } from './member-marks'

/**
 * Every dancer's account signal, by MEMBER id.
 *
 * Two queries and not a join: the sessions count is per account, and the device
 * counts are #652's own grouped read over two more tables. Joining any two of
 * them multiplies one by the other, which is the revenue-join-inflation mistake
 * in miniature.
 *
 * A Member absent from the map has no login pointing at it, which the screen
 * reads as the same "nije ušao" as an account nobody ever opened.
 */
export async function loadMemberAccountSignals(
  query: PoolQuery,
): Promise<Map<string, MemberAccountSignal>> {
  const accounts = await query(
    `SELECT u.id AS user_id,
            u.member_id AS member_id,
            (u.email IS NOT NULL AND u.email <> '') AS has_address,
            COUNT(s.id)::int AS sessions
       FROM users u
       LEFT JOIN users_sessions s ON s._parent_id = u.id
      WHERE u.member_id IS NOT NULL
      GROUP BY u.id`,
  )

  const userIds = accounts.rows
    .map((row) => row.user_id)
    .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
  const devices = await loadDeviceSignals(query, userIds)

  const signals = new Map<string, MemberAccountSignal>()
  for (const row of accounts.rows) {
    if (row.member_id == null) continue
    signals.set(String(row.member_id), {
      sessions: Number(row.sessions) || 0,
      device: devices.get(String(row.user_id)) ?? NO_DEVICE_SIGNAL,
      hasEmail: row.has_address === true,
    })
  }
  return signals
}
