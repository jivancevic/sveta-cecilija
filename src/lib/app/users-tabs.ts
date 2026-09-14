// Korisnici's sixth action: the three screens an account opens on (#563, Q52,
// with the own-row refusal dropped by #591).
//
// A tab bar belongs to the ACCOUNT and not to the rank. Tatjana and Luka both
// hold `tickets`, and one of them opens Cecilija on Narudžbe while the other
// opens it on the dance; a ranked bar can only be right for one of them. So a
// `users` holder picks up to three screens per account and the generic order in
// `screens.ts` covers everybody nobody has picked for.
//
// Three things this write is NOT, the first and the third of them a refusal
// below:
//
//  1. **Not access.** A tab is an order, never a permission: a key the account's
//     set does not unlock is refused here (400) and dropped again on read, so a
//     bar can never be the reason somebody sees a screen.
//  2. **Not self-service, except for the one person who does this job.** A bar
//     is somebody's decision ABOUT an account rather than a thing an account
//     picks for itself, and a `users` holder is simply allowed to be that
//     somebody for themselves (#591, reversing Q52's own-row refusal): asking
//     the other `users` holder is not advice in a society that has one. Profil
//     still carries no tab picker, so the decision stays where it lives.
//  3. **Not the Backoffice's.** `Users.tabs` is field-locked to `users` and the
//     seam writes with `overrideAccess: true`, so — as with `permissions` —
//     `requirePermission(req, 'users')` in the route IS the lock.
//
// The rules are pure and the IO is injected, in the shape the other five
// Korisnici writes already use (`users-admin.ts`, `users-link.ts`).

import type { Permission } from '@/lib/access/permissions'
import {
  MAX_TABS,
  isTabKey,
  screenByKey,
  unlockedScreens,
  type AppScreenKey,
  type NavContext,
} from './screens'
import { APP_STRINGS } from './strings'
import type { AppRequestMeta } from './request-guard'
import { fail, refuseCaller, type UsersCaller, type UsersResult } from './users-admin'

const S = APP_STRINGS.users

/**
 * The account being arranged, as this write needs it.
 *
 * `ctx` is resolved by the caller rather than derived here, because the two
 * conditional permissions hang on rows this module must not load: `moreskant`
 * on a live Member, `partner` on a Partner link. The same two facts the access
 * decision resolves, resolved once, so a bar can never offer a screen the gate
 * would then refuse.
 */
export interface TabsTarget {
  id: string
  permissions: Permission[]
  ctx: NavContext
}

export interface SetTabsDeps {
  /** Origin / Sec-Fetch-Site / Content-Type, plus the origins we own. */
  request: AppRequestMeta
  caller: UsersCaller
  /** The account being edited, re-read server-side rather than trusted. */
  loadTarget: (id: string) => Promise<TabsTarget | null>
  save: (id: string, tabs: AppScreenKey[]) => Promise<void>
}

/**
 * The keys as they arrived from the browser, or the Croatian refusal.
 *
 * Strict, unlike `tabKeysOf`, which reads a stored row: a person is looking at
 * what they just chose, so a key that is not a screen, a fourth key or the same
 * screen twice is told about rather than quietly dropped into a smaller bar
 * than the one on the screen in front of them.
 */
export function parseTabKeys(input: unknown): { keys: AppScreenKey[] } | { error: string } {
  if (!Array.isArray(input)) return { error: S.tabs.invalid }
  if (input.length > MAX_TABS) return { error: S.tabs.tooMany(MAX_TABS) }
  const keys: AppScreenKey[] = []
  for (const entry of input) {
    if (!isTabKey(entry)) return { error: S.tabs.invalid }
    if (keys.includes(entry)) return { error: S.tabs.duplicate }
    keys.push(entry)
  }
  return { keys }
}

/**
 * PATCH /api/app/users/[id]/tabs `{ tabs }`.
 *
 * 403 cross-site or a shared login, 404 for an id that is nobody, 400 for a key
 * that is not a screen, a fourth key, a repeated one or a screen this account
 * does not unlock, 200 otherwise. An empty list is a valid answer and means
 * "back to the generic order".
 *
 * The caller's own row is NOT refused (#591): a `users` holder arranges any
 * bar, their own included, and the unlock check below is what keeps a tab from
 * ever becoming a permission.
 */
export async function handleSetTabs(
  targetId: string,
  input: { tabs?: unknown } | null | undefined,
  deps: SetTabsDeps,
): Promise<UsersResult> {
  const refused = refuseCaller(deps.request, deps.caller)
  if (refused) return refused

  let target: TabsTarget | null = null
  try {
    target = await deps.loadTarget(targetId)
  } catch {
    // A read that throws and a read that finds nothing are the same answer to
    // the reader: that row is not there.
    target = null
  }
  if (!target) return fail(404, S.missing)

  const parsed = parseTabKeys(input?.tabs)
  if ('error' in parsed) return fail(400, parsed.error)

  // A tab is an order, never a permission (see the note at the top).
  const open = new Set(
    unlockedScreens({ permissions: target.permissions }, target.ctx).map((s) => s.key),
  )
  const locked = parsed.keys.find((key) => !open.has(key))
  if (locked) return fail(400, S.tabs.locked(screenByKey(locked).label))

  try {
    await deps.save(target.id, parsed.keys)
  } catch (err) {
    console.error('[handleSetTabs] save failed:', err instanceof Error ? err.message : err)
    return fail(500, S.tabs.failed)
  }

  return {
    status: 200,
    body: {
      ok: true,
      tabs: parsed.keys,
      message: parsed.keys.length === 0 ? S.tabs.cleared : S.tabs.saved,
    },
  }
}
