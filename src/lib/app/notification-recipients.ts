// The two audiences the inbox added (#496): staff, and the door.
//
// Dancers and voditelji already had loaders — `loadUserIdsByMember` and
// `loadVoditeljUserIds` in `src/lib/push/store.ts` — because push already
// needed them. These two are new, because the two staff kinds (a new inquiry, a
// new card dispute) and the door's inbox-only rows have no push behind them.
//
// Raw SQL rather than a Payload `find`, for the reason `loadVoditeljUserIds`
// spells out: `permissions` is a hasMany select living in its own
// `users_permissions` join table, and `{ permissions: { contains: 'tickets' } }`
// is not a query Payload's Postgres adapter expresses over it. The vocabulary
// is still `src/lib/access/permissions.ts`'s (CLAUDE.md hard rule: never
// re-type it) — the words below are VALUES of that enum, passed as parameters.

import type { PoolQuery } from '@/lib/db/pool-query'
import type { Permission } from '@/lib/access/permissions'

/**
 * Every unshared account holding `tickets`: the audience of the two staff kinds.
 *
 * SHARED accounts are excluded, the same rule and the same reason as the
 * withdrawal notice (#441 review, ADR-0022): a shared login is a login several
 * people use, so an unread count on it is nobody's and everybody's at once.
 */
export async function loadStaffUserIds(query: PoolQuery): Promise<string[]> {
  const permission: Permission = 'tickets'
  const res = await query(
    `SELECT DISTINCT up.parent_id
       FROM users_permissions up
       JOIN users u ON u.id = up.parent_id
      WHERE up.value = $1 AND u.shared IS NOT TRUE`,
    [permission],
  )
  return res.rows.map((row) => String(row.parent_id))
}

/**
 * The words that already put an account in one of the other audiences. A `door`
 * holder who also holds one of these is not "door-only" and is reached there.
 */
const ALREADY_ADDRESSED: Permission[] = ['tickets', 'moreska', 'moreskant']

/**
 * Accounts holding `door` and nothing that already addresses them.
 *
 * These are the accounts #496 settled the route map's open question for: they
 * are FILED a row about the evening (a performance created, moved, or
 * cancelled) and never pushed. `DOOR_INBOX_KINDS` in `notification-audience.ts`
 * is where that rule lives; this only finds the accounts.
 *
 * Shared logins are deliberately NOT excluded here, unlike everywhere else: the
 * door account (`tehnika`) IS shared by design, and a silent row saying tonight
 * moved indoors is exactly what the person holding that phone needs. Nothing
 * rings, so there is no device belonging to nobody to ring.
 */
export async function loadDoorOnlyUserIds(query: PoolQuery): Promise<string[]> {
  const permission: Permission = 'door'
  const res = await query(
    `SELECT DISTINCT up.parent_id
       FROM users_permissions up
      WHERE up.value = $1
        AND NOT EXISTS (
          SELECT 1 FROM users_permissions other
           WHERE other.parent_id = up.parent_id
             AND other.value::text = ANY($2::text[])
        )`,
    [permission, ALREADY_ADDRESSED],
  )
  return res.rows.map((row) => String(row.parent_id))
}
