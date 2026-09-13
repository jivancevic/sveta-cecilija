// The Payload-backed `MembersRepo` (#506, #475).
//
// `active` defaults to true in the collection, so only an explicit `false`
// retires a member — the same reading `createPartnersRepo` gives the Partners
// flag, and the reason the `where` asks for `not_equals: false` rather than
// `equals: true`: a row written before the column existed has a null there and
// is still a member.

import type { MembersRepo } from '../members'
import { payloadClient, type PayloadClient } from './client'

/** The picker is a phone list, not a report: one screenful of scrolling. */
const MAX_MEMBERS = 1000

export function createMembersRepo(
  load: () => Promise<PayloadClient> = payloadClient,
): MembersRepo {
  return {
    async listActive() {
      const payload = await load()
      const res = await payload.find({
        collection: 'members',
        where: { active: { not_equals: false } },
        sort: 'name',
        limit: MAX_MEMBERS,
        depth: 0,
        overrideAccess: true,
      })
      return res.docs.map((doc) => ({
        id: String(doc.id),
        name: (doc.name as string) ?? '',
      }))
    },

    async create(name, ctx) {
      const payload = await load()
      const doc = await payload.create({
        collection: 'members',
        // Name only, by design: see the note on `MembersRepo.create`.
        data: { name, active: true },
        user: ctx.user as Parameters<PayloadClient['create']>[0]['user'],
      })
      return { id: String(doc.id), name: (doc.name as string) ?? name }
    },
  }
}
