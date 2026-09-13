// Korisnici, the two writes that decide what an account may do (#510).
//
// `/app/users` is where a `users` holder edits a permission set and marks a
// login shared. Both are the same shape as every other `/app` write — pure
// rules here, Payload in the route — and both carry three refusals nothing else
// in the app has to:
//
//  1. **The lockout guard.** The caller may not take `users` off their OWN
//     account. There is one `users` holder in this society, so a set saved
//     without it is not a demotion, it is the end of account administration
//     until somebody edits the database by hand. It is deliberately about the
//     CALLER and not about the permission: demoting another `users` holder is
//     ordinary work, and a "there must always be one" rule would be a race
//     between two tabs rather than a guarantee.
//  2. **A shared login may not edit its own record** (ADR-0022). The collection
//     says so in `userUpdateAccess`, and the local API runs `overrideAccess:
//     true`, so this route says it again or it is not said at all.
//  3. **A named person needs an e-mail** (`user-email-policy.ts`). The Users
//     `beforeValidate` hook enforces it too and would answer a 400 of its own,
//     but in English and about `permissions`; the reader gets a Croatian
//     sentence naming the repair instead.
//
// The route IS the lock here, for a reason worth keeping in view: `permissions`
// and `shared` are field-locked to a `users` holder, and field access does not
// run under `overrideAccess`. A missing check in the handler would therefore
// fail **open and in silence** rather than with an error.

import {
  PERMISSIONS,
  isPermission,
  type Permission,
} from '@/lib/access/permissions'
import { emailRequiredFor } from '@/lib/access/user-email-policy'
import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'

const S = APP_STRINGS.users

/** The calling login: who they are, and whether several people are them. */
export interface UsersCaller {
  id: string
  shared: boolean
}

/** One account as this screen reads it. A projection, never a Payload doc. */
export interface UsersTarget {
  id: string
  username: string | null
  name: string | null
  email: string | null
  permissions: Permission[]
  shared: boolean
}

/** What every route on this screen answers with. */
export interface UsersResult {
  status: number
  body: Record<string, unknown>
}

export function fail(status: number, error: string): UsersResult {
  return { status, body: { error } }
}

/**
 * The cross-site guard, as the four write routes of this screen share it.
 *
 * Returned rather than thrown so each handler keeps a single exit shape, and
 * the sentence is one for all of them: a reader who sees it has a browser
 * problem, not a permissions problem.
 */
export function rejectedRequest(request: AppRequestMeta): UsersResult | null {
  const rejection = rejectAppRequest(request)
  return rejection ? fail(rejection.status, S.rejected) : null
}

/**
 * A permission set as it arrived from the browser, or null when it is not one.
 *
 * Deliberately stricter than `permissionsOf`, which DROPS an unknown word. That
 * is right when reading a stale row and wrong when writing one: a typo'd or
 * stale word in a PATCH must be refused, not silently saved as a smaller set
 * than the reader ticked. The order is the vocabulary's, so a set has one
 * spelling in the database however the checkboxes were clicked.
 */
export function parsePermissionSet(input: unknown): Permission[] | null {
  if (!Array.isArray(input)) return null
  if (!input.every((p) => isPermission(p))) return null
  const held = new Set(input as Permission[])
  return PERMISSIONS.filter((p) => held.has(p))
}

/** What changed, for the sentence the screen prints and for the audit trail. */
export function permissionDiff(
  before: readonly Permission[],
  after: readonly Permission[],
): { added: Permission[]; removed: Permission[] } {
  const had = new Set(before)
  const has = new Set(after)
  return {
    added: PERMISSIONS.filter((p) => has.has(p) && !had.has(p)),
    removed: PERMISSIONS.filter((p) => had.has(p) && !has.has(p)),
  }
}

export interface UpdatePermissionsDeps {
  /** Origin / Sec-Fetch-Site / Content-Type, plus the origins we own. */
  request: AppRequestMeta
  caller: UsersCaller
  /** The account being edited, re-read server-side rather than trusted. */
  loadUser: (id: string) => Promise<UsersTarget | null>
  save: (id: string, permissions: Permission[]) => Promise<void>
}

/**
 * PATCH /api/app/users/[id]/permissions `{ permissions }`.
 *
 * 403 cross-site or a shared login on itself, 404 for an id that is nobody,
 * 400 for a word outside the vocabulary or a named-person set with no address,
 * 409 for the self-lockout, 200 with the diff otherwise.
 */
export async function handleUpdatePermissions(
  targetId: string,
  input: { permissions?: unknown } | null | undefined,
  deps: UpdatePermissionsDeps,
): Promise<UsersResult> {
  const rejected = rejectedRequest(deps.request)
  if (rejected) return rejected

  const target = await loadOr404(targetId, deps.loadUser)
  if ('missing' in target) return target.missing

  const self = target.user.id === deps.caller.id
  if (self && deps.caller.shared) return fail(403, S.sharedSelf)

  const next = parsePermissionSet(input?.permissions)
  if (!next) return fail(400, S.permissions.invalid)

  // The lockout guard. Only the caller's own row, and only this one word.
  if (self && !next.includes('users')) return fail(409, S.permissions.selfLockout)

  // The same rule the Users hook applies, said in Croatian and before the write
  // so the reader is told which repair to make rather than shown a 500.
  if (emailRequiredFor({ permissions: next }) && !target.user.email?.trim()) {
    return fail(400, S.permissions.emailRequired)
  }

  try {
    await deps.save(target.user.id, next)
  } catch (err) {
    console.error('[handleUpdatePermissions] save failed:', err instanceof Error ? err.message : err)
    return fail(500, S.permissions.failed)
  }

  const diff = permissionDiff(target.user.permissions, next)
  return {
    status: 200,
    body: {
      ok: true,
      permissions: next,
      ...diff,
      message:
        diff.added.length + diff.removed.length === 0 ? S.permissions.unchanged : S.permissions.saved,
    },
  }
}

export interface SetSharedDeps extends Omit<UpdatePermissionsDeps, 'save'> {
  setShared: (id: string, shared: boolean) => Promise<void>
}

/**
 * POST /api/app/users/[id]/shared `{ shared }`.
 *
 * The one refusal that is not about permissions: **never on the caller's own
 * login**. A `users` holder who marks themselves shared would be telling
 * `userUpdateAccess` that several people are them, and the flag is exactly the
 * thing a shared account may not edit, so the mistake would have no undo from
 * inside the app. Somebody else with `users` changes it, or nobody does.
 */
export async function handleSetShared(
  targetId: string,
  input: { shared?: unknown } | null | undefined,
  deps: SetSharedDeps,
): Promise<UsersResult> {
  const rejected = rejectedRequest(deps.request)
  if (rejected) return rejected

  const target = await loadOr404(targetId, deps.loadUser)
  if ('missing' in target) return target.missing

  if (typeof input?.shared !== 'boolean') return fail(400, S.shared.failed)
  if (target.user.id === deps.caller.id) return fail(409, S.shared.notSelf)

  try {
    await deps.setShared(target.user.id, input.shared)
  } catch (err) {
    console.error('[handleSetShared] save failed:', err instanceof Error ? err.message : err)
    return fail(500, S.shared.failed)
  }

  return { status: 200, body: { ok: true, shared: input.shared, message: S.shared.saved } }
}

/**
 * The account, or the 404 every handler answers with.
 *
 * A read that throws is the same answer as a read that found nothing: from the
 * reader's side both are "that row is not there", and the alternative is a 500
 * on a screen whose whole job is to be usable when something is wrong.
 */
export async function loadOr404(
  id: string,
  loadUser: (id: string) => Promise<UsersTarget | null>,
): Promise<{ user: UsersTarget } | { missing: UsersResult }> {
  let user: UsersTarget | null = null
  try {
    user = await loadUser(id)
  } catch {
    user = null
  }
  if (!user) return { missing: fail(404, S.missing) }
  return { user }
}
