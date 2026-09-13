// UsersRepo — the accounts themselves (#510, #475).
//
// The one repo whose WRITES are the security boundary rather than a
// convenience. `Users.permissions`, `Users.shared` and `Users.member` are
// field-locked to a `users` holder, and field-level access does NOT run under
// `overrideAccess: true`, which every write in this seam uses. So every method
// below bypasses a lock by construction, and the thing standing in its place is
// `requirePermission(req, 'users')` in the route that calls it. That is written
// here as well as there because this interface is where somebody reaching for a
// second caller will look.
//
// Two consequences shape the shape:
//
//  1. **No generic `update`.** There is one method per decision — a permission
//     set, the shared flag, the chosen tabs, a partner link, a member link, a
//     password — so a new caller cannot write a field nobody reviewed. `MembersRepo.create` is
//     name-only for the same reason: the signature is the refusal.
//  2. **Never a Payload document.** A Users row carries `salt`, `hash`, the
//     reset token and the session list. `UserAccount` is an explicit
//     projection, so none of that can leave the seam by accident.
//
// The writes go through Payload's local API (phase A), so the collection's
// `beforeValidate` e-mail policy keeps running — it is the only write hook
// Users has, and it judges the resulting document rather than the actor.
// `WriteCtx` is carried anyway, as `req.user`: nothing reads it here today, and
// it is what makes an edit made from a phone attributable the way a Backoffice
// edit is if a hook ever wants the actor. (The `afterLogin` admin-language hook
// is not in this path at all: it fires on a login, not on a write.)

import type { Permission } from '@/lib/access/permissions'
import type { AppScreenKey } from '@/lib/app/screens'
import type { LinkSelfMember } from '@/lib/app/link-self'
import type { NewUserData } from '@/lib/app/users-account'
import type { UserAccount } from '@/lib/app/users-view'
import type { WriteCtx } from './auth'

export interface UsersRepo {
  /**
   * Every account, with its permission set and both links resolved by name.
   *
   * One query for the list rather than one per row: eighteen accounts is the
   * whole of it, and the screen filters and sorts in memory (`users-view.ts`)
   * so the search box needs no round trip.
   */
  list(): Promise<UserAccount[]>

  /** One account, or null when the id is not one. */
  byId(id: string): Promise<UserAccount | null>

  /** Is this username already on some account? Case-insensitive by storage. */
  usernameTaken(username: string): Promise<boolean>

  /** Is this address already on some account? Payload's index is unique. */
  emailTaken(email: string): Promise<boolean>

  /** Opens an account. The password is hashed by Payload and never stored raw. */
  create(data: NewUserData, ctx: WriteCtx): Promise<{ id: string; username: string }>

  /** The whole set, replaced. The rules that decide it are in `users-admin.ts`. */
  updatePermissions(id: string, permissions: Permission[], ctx: WriteCtx): Promise<void>

  /** ADR-0022's only marker of a login several people hold. */
  setShared(id: string, shared: boolean, ctx: WriteCtx): Promise<void>

  /**
   * The three screens this account opens on, in order (#563).
   *
   * Replaced whole, like the permission set, and for the same reason: a bar is
   * one decision with an order in it, not three independent flags. The rules
   * that decide it are in `users-tabs.ts`; an empty list is the generic order.
   */
  setTabs(id: string, tabs: AppScreenKey[], ctx: WriteCtx): Promise<void>

  /** The reseller this login sells for, or null to unlink. */
  linkPartner(id: string, partnerId: string | null, ctx: WriteCtx): Promise<void>

  /** The dancer this login is, or null to unlink (#487's one-person-one-row). */
  linkMember(id: string, memberId: string | null, ctx: WriteCtx): Promise<void>

  /**
   * A new password, for an account with no address to send a link to.
   *
   * Payload hashes it in the update; the plaintext exists only in the response
   * the `users` holder reads once, and is never logged.
   */
  setPassword(id: string, password: string, ctx: WriteCtx): Promise<void>

  /**
   * Payload's `forgotPassword`, e-mail disabled, resolving with the token.
   *
   * It belongs to `repo.auth` by rights (the seam research puts the login
   * operations there) and sits here because `repo.auth` has not grown them yet
   * and Korisnici needs one now. It moves with the rest of them, not on its own.
   */
  issueResetToken(
    target: { username?: string; email?: string },
    expirationMs: number,
  ): Promise<string | null>

  /** One Member, for the link refusal. Never their e-mail (ADR-0024). */
  memberById(memberId: string): Promise<LinkSelfMember | null>

  /** Ids of every login whose `member` points at this Member. Normally none. */
  userIdsByMember(memberId: string): Promise<string[]>

  /**
   * The roster and the links it already has, for the member picker.
   *
   * Two raw facts rather than a filtered list, because the filtering rule is
   * `eligibleCandidates` in `link-self.ts` and is shared with `/app/account`:
   * one definition of "an active moreškant without a login", applied above the
   * seam where it is unit-tested.
   */
  linkTargets(): Promise<{ members: LinkSelfMember[]; memberIdsWithLogin: string[] }>
}

export type { UserAccount }
