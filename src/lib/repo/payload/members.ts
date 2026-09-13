// The Payload-backed `MembersRepo` (#511, #475).
//
// `active` defaults to true in the collection, so only an explicit `false`
// retires a member — the same reading `createPartnersRepo` gives the Partners
// flag, and the reason nothing here tests `active === true`.
//
// Both writes run through the local API rather than `payload.db`, which is the
// seam's rule and load-bearing here: the Members `beforeValidate` hook is the
// only writer that can see the other rows, so it is the only place nickname
// uniqueness can be decided. Its refusal arrives as a Payload `APIError` whose
// message is already the Croatian sentence a voditelj should read, so the two
// writers unwrap it rather than swallowing it.

import { loadMemberIdsWithLogin, type UserLinkFinder } from '@/lib/access/member-logins'
import type { MemberRosterRow } from '@/lib/app/members-screen'
import { MemberHookError, type MembersRepo, type NewMoreskant } from '../members'
import { payloadClient, type PayloadClient } from './client'

/** The society has tens of members, not thousands: one unpaginated page. */
const MAX_MEMBERS = 1000

/** A Members document as the roster reads it. A projection, never a spread. */
export function toRosterRow(doc: Record<string, unknown>): MemberRosterRow {
  return {
    id: String(doc.id),
    name: typeof doc.name === 'string' ? doc.name : '',
    nickname: typeof doc.nickname === 'string' ? doc.nickname : null,
    mobile: typeof doc.mobile === 'string' ? doc.mobile : null,
    email: typeof doc.email === 'string' ? doc.email : null,
    roles: Array.isArray(doc.roles) ? doc.roles.filter((r): r is string => typeof r === 'string') : [],
    primaryRole: typeof doc.primaryRole === 'string' ? doc.primaryRole : null,
    active: doc.active !== false,
    // Anything other than a literal true is "no": the safe direction, and the
    // same reading `isMoreskantRow` gives it (ADR-0024).
    isMoreskant: doc.isMoreskant === true,
  }
}

/**
 * The hook's sentence, or nothing.
 *
 * Payload wraps a `beforeValidate` throw as an `APIError` and keeps the
 * message; anything else (a dead connection, a bug) has no sentence a voditelj
 * could act on, so it is re-thrown and becomes a 500 rather than a 400 with a
 * stack trace in it.
 */
function hookMessage(err: unknown): string | null {
  if (err == null || typeof err !== 'object') return null
  const status = (err as { status?: unknown }).status
  const message = (err as { message?: unknown }).message
  if (status === 400 && typeof message === 'string' && message.trim() !== '') return message
  return null
}

export function createMembersRepo(
  load: () => Promise<PayloadClient> = payloadClient,
): MembersRepo {
  async function write(
    run: (payload: PayloadClient) => Promise<Record<string, unknown>>,
  ): Promise<MemberRosterRow> {
    const payload = await load()
    try {
      return toRosterRow(await run(payload))
    } catch (err) {
      const message = hookMessage(err)
      if (message) throw new MemberHookError(message)
      throw err
    }
  }

  return {
    async listMoreskanti() {
      const payload = await load()
      const res = await payload.find({
        collection: 'members',
        where: { isMoreskant: { equals: true } },
        limit: MAX_MEMBERS,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      return (res.docs ?? []).map((doc) => toRosterRow(doc as unknown as Record<string, unknown>))
    },

    async byId(id) {
      const payload = await load()
      try {
        const doc = (await payload.findByID({
          collection: 'members',
          id,
          depth: 0,
          overrideAccess: true,
        })) as unknown as Record<string, unknown> | null
        if (!doc || doc.id == null) return null
        return toRosterRow(doc)
      } catch {
        return null
      }
    },

    async idsWithLogin() {
      const payload = await load()
      return loadMemberIdsWithLogin(payload as unknown as UserLinkFinder)
    },

    update(id, patch, ctx) {
      return write(
        async (payload) =>
          (await payload.update({
            collection: 'members',
            id,
            data: patch as Record<string, never>,
            depth: 0,
            overrideAccess: true,
            user: ctx.user as Parameters<PayloadClient['update']>[0]['user'],
          })) as unknown as Record<string, unknown>,
      )
    },

    createMoreskant(input: NewMoreskant, ctx) {
      return write(
        async (payload) =>
          (await payload.create({
            collection: 'members',
            data: input as unknown as Record<string, never>,
            depth: 0,
            overrideAccess: true,
            user: ctx.user as Parameters<PayloadClient['create']>[0]['user'],
          })) as unknown as Record<string, unknown>,
      )
    },
  }
}
