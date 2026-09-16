// Članovi, the write half (#511): editing a dancer's profile and adding one.
//
// Until this screen a voditelj changed a dancer's roles in the Backoffice, on a
// Payload edit form with eleven fields, six of which are invisible to them and
// two of which they may not write. Here they see the six that are theirs, and
// every refusal is a Croatian sentence rather than a red field.
//
// **The rules are not re-typed.** `validateAndNormaliseMoreskant` is the same
// pure function the Members `beforeValidate` hook runs (ADR-0024, #420), so the
// nickname rule, the role vocabulary, the "a king needs his army" rule and the
// trimming all come from one place. This module runs it BEFORE the write so a
// voditelj gets the sentence without a round trip, and the hook runs it again on
// the way in, where it can also see the other rows — which is why nickname
// UNIQUENESS is the hook's alone and reaches the screen as `save()`'s message.
//
// Two things this module decides that the hook does not:
//
//   1. **What a `moreska` holder may write at all.** The local API runs
//      `overrideAccess: true` inside the seam, so the Members field locks do
//      not apply to it (CLAUDE.md hard rule: a form that must refuse a field
//      refuses it in its route). `name` and `note` are the ADR-0019 attribution
//      half and are refused here, exactly as `canEditAttributionField` refuses
//      them in the Backoffice.
//   2. **`active` on a moreškant row is the voditelj's.** The field is locked to
//      `tickets` on the collection because retiring a Member removes them from
//      the comp picker; but `membersDeleteAccess` says in the same file that a
//      voditelj retires a DANCER with `active` rather than by deleting a row,
//      and this screen only ever addresses moreškant rows. So it is a narrow,
//      permission-checked hole in that lock — the shape #462 used for
//      `Users.member` — and never a way to retire a plain attribution name.
//
// Pure and DI like every other `/app` handler: no Payload, no fetch, so each
// rule is a row in members-edit.test.ts.

import {
  MoreskantProfileError,
  validateAndNormaliseMoreskant,
  type DanceRole,
} from '@/lib/moreskant-profile'
import { normalizeMobile } from './invite-link'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'
import { APP_STRINGS } from './strings'
import type { MemberRosterRow } from './members-screen'

const S = APP_STRINGS.members

/** The write's outcome as the data layer reports it: the hook may have refused. */
export type MemberSaveOutcome =
  | { ok: true; member: MemberRosterRow }
  | { ok: false; message: string }

export interface MemberEditDeps {
  /** Origin / Sec-Fetch-Site / Content-Type, plus the origins we own. */
  request: AppRequestMeta
  /** The row as it stands, so a partial patch is validated as a whole document. */
  loadMember: (id: string) => Promise<MemberRosterRow | null>
  /** Writes through the seam's local API, so the collection hook runs. */
  save: (id: string, patch: Record<string, unknown>) => Promise<MemberSaveOutcome>
  /** Creates a dancer by hand, `isMoreskant` included. */
  create: (input: Record<string, unknown>) => Promise<MemberSaveOutcome>
}

export interface MemberWriteResult {
  status: number
  body: { ok: true; member: MemberRosterRow } | { error: string }
}

function fail(status: number, error: string): MemberWriteResult {
  return { status, body: { error } }
}

/**
 * The six keys a voditelj owns. Anything else in the body is a refusal.
 *
 * `email` was the seventh until #651 (ADR-0028): a dancer's address is now
 * their own login's, written by the person who owns the inbox, and a voditelj
 * keeps the mobile.
 */
const EDITABLE = ['nickname', 'mobile', 'roles', 'primaryRole', 'active', 'yearRound'] as const

/** The attribution half (ADR-0019). Named so the refusal can say which it was. */
const LOCKED = ['name', 'note'] as const

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * A patch read off the request body, or the sentence that refuses it.
 *
 * Only the keys that are PRESENT are read, so a form that sends three fields
 * changes three fields: this is the difference between a patch and a form post,
 * and it is what lets the profile screen and a future one-field action share a
 * route.
 */
function readPatch(body: unknown): { patch: Record<string, unknown> } | { error: string; status: number } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: S.invalidBody, status: 400 }
  }
  const input = body as Record<string, unknown>

  for (const key of LOCKED) {
    if (key in input) return { error: S.lockedField, status: 403 }
  }

  const patch: Record<string, unknown> = {}

  if ('nickname' in input) {
    if (typeof input.nickname !== 'string') return { error: S.invalidBody, status: 400 }
    patch.nickname = input.nickname.trim()
  }

  if ('mobile' in input) {
    const mobile = text(input.mobile)
    if (mobile === '') patch.mobile = null
    else {
      // A number the dialler cannot read is a broken SMS invitation, which is
      // the one thing this screen exists to send. Better refused than stored.
      if (normalizeMobile(mobile) === null) return { error: S.badMobile, status: 400 }
      patch.mobile = mobile
    }
  }

  if ('roles' in input) {
    if (!Array.isArray(input.roles)) return { error: S.invalidBody, status: 400 }
    if (input.roles.some((r) => typeof r !== 'string')) return { error: S.invalidBody, status: 400 }
    patch.roles = [...new Set(input.roles as string[])]
  }

  if ('primaryRole' in input) {
    if (typeof input.primaryRole !== 'string') return { error: S.invalidBody, status: 400 }
    patch.primaryRole = input.primaryRole
  }

  if ('active' in input) {
    if (typeof input.active !== 'boolean') return { error: S.invalidBody, status: 400 }
    patch.active = input.active
  }

  if ('yearRound' in input) {
    if (typeof input.yearRound !== 'boolean') return { error: S.invalidBody, status: 400 }
    patch.yearRound = input.yearRound
  }

  return { patch }
}

/**
 * The moreškant rules, run on the document the write would produce.
 *
 * The merge is the point: Payload's hook validates `{stored, ...patch}` and so
 * does this, or a patch that only moves `primaryRole` would be judged without
 * the roles it has to be among.
 */
function validateMerged(
  current: Partial<MemberRosterRow>,
  patch: Record<string, unknown>,
): { normalised: Record<string, unknown> } | { error: string } {
  const merged: Record<string, unknown> = {
    ...current,
    ...patch,
    isMoreskant: true,
  }
  try {
    return { normalised: validateAndNormaliseMoreskant(merged) }
  } catch (err) {
    if (err instanceof MoreskantProfileError) return { error: err.message }
    throw err
  }
}

/**
 * `PATCH /api/app/members/[id]`.
 *
 * 403/415 for a cross-site or non-JSON request (a cookie-authenticated write),
 * 403 for the attribution half, 404 for an id that is not a moreškant, 400 for
 * every rule the profile breaks, 200 otherwise. The permission itself is the
 * route's: `requirePermission(req, 'moreska')` runs before any of this.
 */
export async function handleMemberPatch(
  id: string,
  body: unknown,
  deps: MemberEditDeps,
): Promise<MemberWriteResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return fail(rejection.status, S.rejected)

  const read = readPatch(body)
  if ('error' in read) return fail(read.status, read.error)
  if (Object.keys(read.patch).length === 0) return fail(400, S.nothingToSave)

  const member = await deps.loadMember(id)
  // A Member that is only a comp-attribution name (ADR-0019) is not this
  // screen's, and the same 404 an unknown id gets is the honest answer: as far
  // as Članovi is concerned it does not exist. Without this check the forced
  // `isMoreskant: true` below would quietly turn one into a dancer.
  if (!member || !member.isMoreskant) return fail(404, S.notFound)

  const checked = validateMerged(member, read.patch)
  if ('error' in checked) return fail(400, checked.error)

  // Write back only the keys the patch actually carried, normalised: a partial
  // update stays partial, the way the collection hook keeps it partial.
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(read.patch)) {
    patch[key] = key in checked.normalised ? checked.normalised[key] : read.patch[key]
  }
  // `null` survives normalisation as null: clearing a mobile is a real edit.
  if ('mobile' in read.patch && read.patch.mobile === null) patch.mobile = null

  const outcome = await deps.save(id, patch)
  if (!outcome.ok) return fail(400, outcome.message)
  return { status: 200, body: { ok: true, member: outcome.member } }
}

/**
 * `POST /api/app/members` — "Dodaj plesača".
 *
 * A voditelj at a rehearsal meets somebody who is not on the list at all. The
 * row it writes is a moreškant from the first save (`isMoreskant: true`), which
 * is what makes the hook's rules apply to it and what keeps a half-filled
 * dancer out of the roster. `active` is not accepted: a new dancer is active,
 * and the collection's default says so.
 */
export async function handleMemberCreate(
  body: unknown,
  deps: MemberEditDeps,
): Promise<MemberWriteResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return fail(rejection.status, S.rejected)

  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, S.invalidBody)
  }
  const input = body as Record<string, unknown>

  // `note` is the ADR-0019 attribution half and a create is not a way around
  // the lock a patch enforces: refused with the same sentence and the same 403,
  // rather than dropped on the floor, so a caller who sent it learns that it
  // did not land. `name` is the deliberate exception — it is required, so a
  // voditelj could not add a dancer at all without it, which is exactly the
  // exception `canEditAttributionField` already carves out on the collection.
  if ('note' in input) return fail(403, S.lockedField)

  const name = text(input.name)
  if (name === '') return fail(400, S.missingName)

  // The rest is exactly a profile patch, so it is read by the same reader and
  // judged by the same rules; `name` is handed over separately because it is
  // the one field the moreškant rules say nothing about, and `active` is
  // dropped because a new dancer is active and the collection's default says
  // so (a voditelj must not be able to file one as already retired).
  const { name: _name, active: _active, ...rest } = input
  const read = readPatch(rest)
  if ('error' in read) return fail(read.status, read.error)

  const checked = validateMerged({}, read.patch)
  if ('error' in checked) return fail(400, checked.error)

  const created: Record<string, unknown> = { name }
  for (const key of EDITABLE) {
    if (key === 'active') continue
    if (key in read.patch) {
      created[key] = key in checked.normalised ? checked.normalised[key] : read.patch[key]
    }
  }
  created.isMoreskant = true

  const outcome = await deps.create(created)
  if (!outcome.ok) return fail(400, outcome.message)
  return { status: 200, body: { ok: true, member: outcome.member } }
}

export type { DanceRole }
