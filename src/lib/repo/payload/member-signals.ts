// The SQL behind the three marks on Članovi (#653, ADR-0028).
//
// **Below the seam, where the seam's own SQL belongs.** It first shipped under
// `src/lib/app/`, and the reason given was that `repo/payload/members.ts` is on
// the roster's PII source scan and this query has to name the e-mail column —
// which is a test being routed around rather than satisfied (#653 review). The
// query lives here now, the scan was fixed to assert the real rule (no address
// VALUE leaves the seam, asserted behaviourally in `own-access-pii.test.ts`),
// and the boundary this module actually keeps is stated in its return type: a
// caller is handed two booleans and never a string.
//
// Two tables that are nobody's collection and two columns no collection read
// exposes, so this is raw SQL through the pool Payload already holds open — the
// `device-store.ts` shape, and the same `PoolQuery` seam, so a probe script can
// ask the same question without dragging the CMS along. The RULES are
// `member-marks.ts` and are pure; nothing here decides anything.
//
// `users.sessions` is read from `users_sessions`, Payload's own array table for
// that field: `addSessionToUser` appends a row on every sign-in and
// `logoutOperation` deletes one on "Odjava". It is hidden from an ordinary
// `find` because it is an auth field, which is why this is SQL and not the
// local API.

import type { PoolQuery } from '@/lib/db/pool-query'
import { NO_DEVICE_SIGNAL } from '@/lib/app/device'
import { loadDeviceSignals } from '@/lib/app/device-store'
import type { MemberAccountSignal } from '@/lib/app/member-marks'

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
            (u.password_set_at IS NOT NULL) AS has_own_password,
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
      // A stamp rather than a hash: every invited account carries a random
      // password `ensureDancerLogin` minted, so `hash IS NOT NULL` is true for
      // the whole roster. Only `PATCH /api/app/account` writes this column.
      //
      // NULL is "we have never seen this dancer choose one", not "they have
      // none" (`readPasswordStamp`, #664). The mark reads it as not done on
      // purpose: for a dancer the unknown half is the dangerous one, and the
      // worst an over-eager 🔑 costs is a voditelj asking again.
      hasOwnPassword: row.has_own_password === true,
    })
  }
  return signals
}
