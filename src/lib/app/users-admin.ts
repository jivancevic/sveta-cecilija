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
//  2. **A shared login may not administer accounts at all** (ADR-0022, widened
//     by the #510 review). The collection only denies a shared account
//     self-edit, and the local API runs `overrideAccess: true` so even that
//     does not reach a route. The wider rule is the honest one: the shared
//     `tehnika` password is written on a wall and handed to whoever works the
//     gate that evening, so a shared login holding `users` would put account
//     administration in the hands of everybody who has ever scanned a ticket.
//     Hence both halves — a shared CALLER is refused on all five routes, and
//     no write may leave `users` on a shared account.
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
 * The two things every route on this screen refuses before it reads anything:
 * a cross-site or non-JSON request, and a shared caller.
 *
 * Returned rather than thrown so each handler keeps a single exit shape. The
 * shared check is here rather than per-route precisely because it must be on
 * ALL of them: a rule that has to be remembered five times is a rule that is
 * eventually applied four times.
 */
export function refuseCaller(
  request: AppRequestMeta,
  caller: UsersCaller,
): UsersResult | null {
  const rejection = rejectAppRequest(request)
  if (rejection) return fail(rejection.status, S.rejected)
  if (caller.shared) return fail(403, S.sharedCaller)
  return null
}

/**
 * May this permission set sit on this account?
 *
 * One rule, checked by all three writers that can produce the pair: a `shared`
 * login never holds `users` (see the note at the top of this file).
 */
export function sharedMayHold(shared: boolean, permissions: readonly Permission[]): boolean {
  return !(shared && permissions.includes('users'))
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
  const refused = refuseCaller(deps.request, deps.caller)
  if (refused) return refused

  const target = await loadOr404(targetId, deps.loadUser)
  if ('missing' in target) return target.missing

  const self = target.user.id === deps.caller.id

  const next = parsePermissionSet(input?.permissions)
  if (!next) return fail(400, S.permissions.invalid)

  // The lockout guard. Only the caller's own row, and only this one word.
  if (self && !next.includes('users')) return fail(409, S.permissions.selfLockout)

  // The other half of the shared rule: no write may leave `users` on a login
  // several people hold.
  if (!sharedMayHold(target.user.shared, next)) {
    return fail(409, S.permissions.sharedUsers)
  }

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
  const refused = refuseCaller(deps.request, deps.caller)
  if (refused) return refused

  const target = await loadOr404(targetId, deps.loadUser)
  if ('missing' in target) return target.missing

  if (typeof input?.shared !== 'boolean') return fail(400, S.shared.failed)
  if (target.user.id === deps.caller.id) return fail(409, S.shared.notSelf)

  // Marking an account shared would otherwise be the back way into "a shared
  // login holding `users`": set the permission first, flip the flag after.
  if (!sharedMayHold(input.shared, target.user.permissions)) {
    return fail(409, S.permissions.sharedUsers)
  }

  try {
    await deps.setShared(target.user.id, input.shared)
  } catch (err) {
    console.error('[handleSetShared] save failed:', err instanceof Error ? err.message : err)
    return fail(500, S.shared.failed)
  }

  return { status: 200, body: { ok: true, shared: input.shared, message: S.shared.saved } }
}

/**
 * The name a login belongs to, as the column carries it: trimmed, capped, and
 * **null when it is empty**.
 *
 * Null rather than `''` because the absence of a name is a fact about the
 * account (`tehnika` is a room, not a person) and one spelling of that fact is
 * enough. The 80 characters are the same cap the create applies; it is there so
 * a paste accident cannot become the title of a screen.
 */
export function normaliseName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().slice(0, 80)
  return value === '' ? null : value
}

export interface SetNameDeps extends Omit<UpdatePermissionsDeps, 'save'> {
  setName: (id: string, name: string | null) => Promise<void>
}

/**
 * PATCH /api/app/users/[id]/name `{ name }` — "Ime" (#617).
 *
 * The seventh action, and the only one on this screen that changes nothing
 * about access: a name is what the reader of a list sees instead of `ttvigna`.
 * So the refusals are the two every route here shares (cross-site, a shared
 * CALLER) plus the 404, and **no self refusal** — correcting the spelling of
 * your own name grants you nothing, which is why `Users.name` is the one
 * unlocked field on this collection.
 *
 * An empty string CLEARS the name rather than failing. A shared login must be
 * able to lose a name somebody typed on it by mistake, and "delete the text and
 * save" is how everybody expects that to work.
 */
export async function handleUpdateName(
  targetId: string,
  input: { name?: unknown } | null | undefined,
  deps: SetNameDeps,
): Promise<UsersResult> {
  const refused = refuseCaller(deps.request, deps.caller)
  if (refused) return refused

  const target = await loadOr404(targetId, deps.loadUser)
  if ('missing' in target) return target.missing

  // A number or an object is a bug in the caller, not an empty name: only a
  // string (or nothing at all) may reach the column.
  if (input?.name !== undefined && typeof input.name !== 'string') {
    return fail(400, S.name.invalid)
  }

  const next = normaliseName(input?.name)
  const before = target.user.name?.trim() || null
  if (next === before) {
    return { status: 200, body: { ok: true, name: next, message: S.name.unchanged } }
  }

  try {
    await deps.setName(target.user.id, next)
  } catch (err) {
    console.error('[handleUpdateName] save failed:', err instanceof Error ? err.message : err)
    return fail(500, S.name.failed)
  }

  return {
    status: 200,
    body: { ok: true, name: next, message: next ? S.name.saved : S.name.cleared },
  }
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
