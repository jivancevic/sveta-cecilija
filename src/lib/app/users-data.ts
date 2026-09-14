// What Korisnici loads and writes on the server (#510).
//
// The IO wiring and nothing else, in the `inquiries-data.ts` shape: the rules
// are in `users-admin.ts`, `users-account.ts` and `users-link.ts`, the wording
// in `users-view.ts`, the queries inside the seam. This file only asks.
//
// It reaches the database through `getRepo()` (ADR-0027 decision 5), so it
// imports no Payload and needs no entry in the repo guard's allow-list — the
// first write-heavy screen for which that is true.
//
// The seven dep factories exist so the seven routes are four lines each. Every
// one of them carries the caller twice over, for two different reasons: as a
// `UsersCaller`, which the pure rules read (the self-lockout, the shared
// refusal), and inside a `WriteCtx`, which the seam hands to Payload's local
// API as `req.user`. No Users hook reads that today — the collection's only
// write hook is the e-mail policy, which judges the document — so the second is
// there so a change made from a phone is attributable the way a Backoffice one
// is, and so a hook that wants the actor later finds it already flowing.

import { getRepo } from '@/lib/repo'
import { isActiveMoreskant } from './access'
import type { WriteCtx } from '@/lib/repo/auth'
import type { PartnerRecord } from '@/lib/repo/partners'
import { eligibleCandidates, type LinkSelfCandidate } from './link-self'
import { unlockedScreens, type AppScreenKey, type NavContext } from './screens'
import type { AppRequestMeta } from './request-guard'
import {
  generateTemporaryPassword,
  unusablePassword,
  type CreateUserDeps,
  type ResetPasswordDeps,
} from './users-account'
import type {
  SetNameDeps,
  SetSharedDeps,
  UpdatePermissionsDeps,
  UsersCaller,
} from './users-admin'
import type { LinkUserDeps } from './users-link'
import type { SetTabsDeps, TabsTarget } from './users-tabs'
import type { UserAccount } from './users-view'

const baseUrl = () => process.env.NEXT_PUBLIC_BASE_URL ?? ''

/** Every account, for the list. Sorting and search are the screen's. */
export async function loadAccounts(): Promise<UserAccount[]> {
  return getRepo().users.list()
}

/** One account, or null when the id is not one. */
export async function loadAccount(id: string): Promise<UserAccount | null> {
  return getRepo().users.byId(id)
}

/** The live resellers a login may be pointed at. */
export async function loadPartnerOptions(): Promise<PartnerRecord[]> {
  return getRepo().partners.activeList()
}

/**
 * The dancers a login may be pointed at: active moreškanti with no login yet.
 *
 * The rule is `eligibleCandidates` from `/app/account`'s self-link (#462), not
 * a second `where` — one definition of "an active moreškant without a login",
 * so the list can never offer a row the POST then refuses.
 */
export async function loadMemberCandidates(): Promise<LinkSelfCandidate[]> {
  const { members, memberIdsWithLogin } = await getRepo().users.linkTargets()
  return eligibleCandidates(members, new Set(memberIdsWithLogin))
}

export function createUpdatePermissionsDeps(
  request: AppRequestMeta,
  caller: UsersCaller,
  ctx: WriteCtx,
): UpdatePermissionsDeps {
  const users = getRepo().users
  return {
    request,
    caller,
    loadUser: (id) => users.byId(id),
    save: (id, permissions) => users.updatePermissions(id, permissions, ctx),
  }
}

export function createSetSharedDeps(
  request: AppRequestMeta,
  caller: UsersCaller,
  ctx: WriteCtx,
): SetSharedDeps {
  const users = getRepo().users
  return {
    request,
    caller,
    loadUser: (id) => users.byId(id),
    setShared: (id, shared) => users.setShared(id, shared, ctx),
  }
}

export function createSetNameDeps(
  request: AppRequestMeta,
  caller: UsersCaller,
  ctx: WriteCtx,
): SetNameDeps {
  const users = getRepo().users
  return {
    request,
    caller,
    loadUser: (id) => users.byId(id),
    setName: (id, name) => users.setName(id, name, ctx),
  }
}

export function createCreateUserDeps(
  request: AppRequestMeta,
  caller: UsersCaller,
  ctx: WriteCtx,
): CreateUserDeps {
  const users = getRepo().users
  return {
    request,
    caller,
    baseUrl: baseUrl(),
    usernameTaken: (username) => users.usernameTaken(username),
    emailTaken: (email) => users.emailTaken(email),
    create: (data) => users.create(data, ctx),
    issueResetToken: (target, ms) => users.issueResetToken(target, ms),
    temporaryPassword: () => generateTemporaryPassword(),
    unusablePassword,
  }
}

export function createResetPasswordDeps(
  request: AppRequestMeta,
  caller: UsersCaller,
  ctx: WriteCtx,
): ResetPasswordDeps {
  const users = getRepo().users
  return {
    request,
    caller,
    baseUrl: baseUrl(),
    loadUser: (id) => users.byId(id),
    setPassword: (id, password) => users.setPassword(id, password, ctx),
    issueResetToken: (target, ms) => users.issueResetToken(target, ms),
    temporaryPassword: () => generateTemporaryPassword(),
  }
}

/** One screen an account may carry in its bar, named in Croatian (#563). */
export interface TabOption {
  key: AppScreenKey
  label: string
}

/**
 * The two conditional facts about an account, as the access decision reads
 * them: `moreskant` needs a live Member, `partner` needs a Partner link.
 *
 * Resolved in one place so the picker on Korisnici and the PATCH behind it
 * cannot disagree about which screens this account unlocks.
 */
async function navContextFor(account: UserAccount): Promise<NavContext> {
  const member = account.memberId ? await getRepo().users.memberById(account.memberId) : null
  return {
    // One definition of "a live dancer", shared with the access decision. The
    // Member arrives as a `LinkSelfMember`, whose roster fields are `unknown`
    // by design (it is read straight off a document), and the decision only
    // reads `active` and `isMoreskant`.
    hasMember: isActiveMoreskant(
      member && {
        id: String(member.id),
        active: member.active !== false,
        isMoreskant: member.isMoreskant === true,
      },
    ),
    hasPartner: account.partnerId !== null,
  }
}

/** What the Tabovi sheet may offer for this account, in rank order. */
export async function loadTabOptions(account: UserAccount): Promise<TabOption[]> {
  const ctx = await navContextFor(account)
  return unlockedScreens({ permissions: account.permissions }, ctx).map((screen) => ({
    key: screen.key,
    label: screen.label,
  }))
}

/**
 * The sixth write: which three screens an account opens on (#563).
 *
 * The target is loaded as the ACCESS decision sees it, not as the list does:
 * `unlockedScreens` strips `moreskant` without a live Member and `partner`
 * without a Partner link, so the two conditional facts are resolved here, once,
 * from the same rows `decideAppAccess` reads. Without that, a bar could be
 * given a screen the gate then refuses, which is the one failure this write can
 * produce and the only reason it loads a second row at all.
 */
export function createSetTabsDeps(
  request: AppRequestMeta,
  caller: UsersCaller,
  ctx: WriteCtx,
): SetTabsDeps {
  const users = getRepo().users
  return {
    request,
    caller,
    loadTarget: async (id): Promise<TabsTarget | null> => {
      const account = await users.byId(id)
      if (!account) return null
      return {
        id: account.id,
        permissions: account.permissions,
        ctx: await navContextFor(account),
      }
    },
    save: (id, tabs) => users.setTabs(id, tabs, ctx),
  }
}

export function createLinkUserDeps(
  request: AppRequestMeta,
  caller: UsersCaller,
  ctx: WriteCtx,
): LinkUserDeps {
  const repo = getRepo()
  return {
    request,
    caller,
    loadUser: (id) => repo.users.byId(id),
    loadMember: (memberId) => repo.users.memberById(memberId),
    userIdsByMember: (memberId) => repo.users.userIdsByMember(memberId),
    // Exists AND is still active: the picker offers active rows only, so this
    // is the rule that makes a stale tab refuse rather than bind a POS login to
    // a reseller that can no longer sell.
    partnerLinkable: async (partnerId) => {
      const partner = await repo.partners.byId(partnerId)
      if (!partner) return 'missing'
      return partner.active ? 'ok' : 'inactive'
    },
    linkMember: (userId, memberId) => repo.users.linkMember(userId, memberId, ctx),
    linkPartner: (userId, partnerId) => repo.users.linkPartner(userId, partnerId, ctx),
  }
}

export type { LinkSelfCandidate, PartnerRecord, UserAccount }
