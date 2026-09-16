// The Payload-backed `UsersRepo` (#510, #475).
//
// Every call runs `overrideAccess: true`, as the whole seam does, so the field
// locks on `permissions`, `shared` and `member` do not apply here. That is the
// point and the danger both: the route that called this has already answered
// `requirePermission(req, 'users')`, and nothing below this line would notice
// if it had not.
//
// `depth: 1` on the reads, because the two links are shown by NAME and a list
// of eighteen relation ids is unreadable; `depth: 0` on the writes, where a
// populated document would only be thrown away.

import { relationIdForWrite as relId, relationIdString } from '@/lib/payload-relation'
import { permissionsOf } from '@/lib/access/permissions'
import { tabKeysOf } from '@/lib/app/screens'
import type { LinkSelfMember } from '@/lib/app/link-self'
import type { UserAccount } from '@/lib/app/users-view'
import { issueAppResetToken } from '@/lib/app/account-data'
import type { UsersRepo } from '../users'
import type { WriteCtx } from '../auth'
import { payloadClient, type PayloadClient } from './client'

/** The society has eighteen logins; this is a wall, not a page size. */
const MAX_USERS = 500

/** The roster the member picker offers from. */
const MAX_MEMBERS = 1000

type Row = Record<string, unknown>

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** A relation as `{ id, name }`, whichever depth Payload handed back. */
function related(value: unknown): { id: string | null; name: string | null } {
  const id = relationIdString(value)
  const name =
    value && typeof value === 'object' ? text((value as { name?: unknown }).name) : null
  return { id, name }
}

/**
 * A Users document as the screen reads it.
 *
 * An explicit projection, never a spread: the document carries `salt`, `hash`,
 * `resetPasswordToken` and the session list, and none of those may leave here.
 */
export function toUserAccount(row: Row | null | undefined): UserAccount | null {
  if (!row || row.id == null) return null
  const partner = related(row.partner)
  const member = related(row.member)
  return {
    id: String(row.id),
    username: text(row.username),
    name: text(row.name),
    email: text(row.email),
    permissions: permissionsOf(row as { permissions?: unknown }),
    shared: row.shared === true,
    // Lenient by contract (#563): a key the table no longer knows shrinks a
    // bar rather than breaking the screen that lists it.
    tabs: tabKeysOf(row.tabs),
    partnerId: partner.id,
    partnerName: partner.name,
    memberId: member.id,
    memberName: member.name,
  }
}

/** A Members document as the link refusal reads it. Never their e-mail. */
export function toLinkMember(row: Row | null | undefined): LinkSelfMember | null {
  if (!row || row.id == null) return null
  return {
    id: row.id as string | number,
    name: text(row.name),
    nickname: text(row.nickname),
    roles: Array.isArray(row.roles) ? row.roles : [],
    primaryRole: text(row.primaryRole),
    active: row.active !== false,
    isMoreskant: row.isMoreskant === true,
  }
}

export function createUsersRepo(
  load: () => Promise<PayloadClient> = payloadClient,
): UsersRepo {
  /** Payload's `user` argument, which the hooks read for attribution. */
  const actor = (ctx: WriteCtx) => ctx.user as Parameters<PayloadClient['update']>[0]['user']

  async function countWhere(where: Record<string, unknown>): Promise<number> {
    const payload = await load()
    const found = await payload.find({
      collection: 'users',
      where: where as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return found.totalDocs ?? found.docs.length
  }

  return {
    async list() {
      const payload = await load()
      const res = await payload.find({
        collection: 'users',
        sort: 'username',
        limit: MAX_USERS,
        depth: 1,
        overrideAccess: true,
      })
      return res.docs
        .map((doc) => toUserAccount(doc as unknown as Row))
        .filter((a): a is UserAccount => a !== null)
    },

    async byId(id) {
      const payload = await load()
      try {
        const doc = await payload.findByID({
          collection: 'users',
          id,
          depth: 1,
          overrideAccess: true,
        })
        return toUserAccount(doc as unknown as Row)
      } catch {
        // Payload throws NotFound for an id that is not one; the screen reads
        // "that account does not exist", which is the same thing.
        return null
      }
    },

    async usernameTaken(username) {
      return (await countWhere({ username: { equals: username } })) > 0
    },

    async emailTaken(email) {
      return (await countWhere({ email: { equals: email } })) > 0
    },

    async create(data, ctx) {
      const payload = await load()
      const doc = (await payload.create({
        collection: 'users',
        data: data as never,
        user: actor(ctx),
        overrideAccess: true,
      })) as unknown as Row
      if (doc?.id == null) throw new Error('users.create returned no id')
      return { id: String(doc.id), username: text(doc.username) ?? data.username }
    },

    async updatePermissions(id, permissions, ctx) {
      const payload = await load()
      await payload.update({
        collection: 'users',
        id,
        data: { permissions } as never,
        user: actor(ctx),
        overrideAccess: true,
      })
    },

    async setTabs(id, tabs, ctx) {
      const payload = await load()
      await payload.update({
        collection: 'users',
        id,
        // A jsonb column: the array IS the value, order included (#563).
        data: { tabs } as never,
        user: actor(ctx),
        overrideAccess: true,
      })
    },

    async setShared(id, shared, ctx) {
      const payload = await load()
      await payload.update({
        collection: 'users',
        id,
        data: { shared } as never,
        user: actor(ctx),
        overrideAccess: true,
      })
    },

    async setName(id, name, ctx) {
      const payload = await load()
      await payload.update({
        collection: 'users',
        id,
        // `null` clears the column; Payload writes it as SQL NULL rather than
        // the empty string, so "no name" has one spelling in the database.
        data: { name } as never,
        user: actor(ctx),
        overrideAccess: true,
      })
    },

    async setEmail(id, email, ctx) {
      const payload = await load()
      await payload.update({
        collection: 'users',
        id,
        // `null` is the explicit clear the Users `beforeValidate` hook is
        // written to see: it reads `'email' in data` and judges the merged
        // document, so omitting the key would silently keep the old address.
        data: { email } as never,
        user: actor(ctx),
        overrideAccess: true,
      })
    },

    async linkPartner(id, partnerId, ctx) {
      const payload = await load()
      await payload.update({
        collection: 'users',
        id,
        data: { partner: relId(partnerId) } as never,
        user: actor(ctx),
        overrideAccess: true,
      })
    },

    async linkMember(id, memberId, ctx) {
      const payload = await load()
      await payload.update({
        collection: 'users',
        id,
        data: { member: relId(memberId) } as never,
        user: actor(ctx),
        overrideAccess: true,
      })
    },

    async setPassword(id, password, ctx) {
      const payload = await load()
      // Payload hashes `password` in its own beforeChange; the column never
      // holds the plaintext, and nothing here logs it.
      //
      // `passwordSetAt: null` rides along, and it is not bookkeeping: this is
      // the TEMPORARY password a `users` holder reads off a screen and dictates
      // (#510), so the account no longer holds one its owner chose. Leaving the
      // stamp would make the *Pristup* mark say a dancer can get back in on their own
      // the moment somebody resets them (#653 review, ADR-0028).
      await payload.update({
        collection: 'users',
        id,
        data: { password, passwordSetAt: null } as never,
        user: actor(ctx),
        overrideAccess: true,
      })
    },

    async issueResetToken(target, expirationMs) {
      const payload = await load()
      return issueAppResetToken(payload, target, expirationMs)
    },

    async memberById(memberId) {
      const payload = await load()
      try {
        const doc = await payload.findByID({
          collection: 'members',
          id: memberId,
          depth: 0,
          overrideAccess: true,
        })
        return toLinkMember(doc as unknown as Row)
      } catch {
        return null
      }
    },

    async userIdsByMember(memberId) {
      const payload = await load()
      const found = await payload.find({
        collection: 'users',
        where: { member: { equals: relId(memberId) } } as never,
        // Two, not one: the answer this feeds is "is anybody ELSE here", and the
        // account being edited may itself be one of the hits.
        limit: 2,
        depth: 0,
        overrideAccess: true,
      })
      return found.docs.map((doc) => String((doc as { id: unknown }).id))
    },

    async linkTargets() {
      const payload = await load()
      const [members, logins] = await Promise.all([
        payload.find({
          collection: 'members',
          where: { isMoreskant: { equals: true } },
          sort: 'name',
          limit: MAX_MEMBERS,
          depth: 0,
          overrideAccess: true,
        }),
        payload.find({
          collection: 'users',
          where: { member: { exists: true } },
          limit: MAX_USERS,
          depth: 0,
          overrideAccess: true,
        }),
      ])
      return {
        members: members.docs
          .map((doc) => toLinkMember(doc as unknown as Row))
          .filter((m): m is LinkSelfMember => m !== null),
        memberIdsWithLogin: logins.docs
          .map((doc) => relationIdString((doc as Row).member))
          .filter((id): id is string => id !== null),
      }
    },
  }
}
