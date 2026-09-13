// The Payload-backed `PartnersRepo` (#505, #475).
//
// `active` defaults to true in the collection, so only an explicit `false`
// deactivates a partner — the same reading `isActiveMoreskant` gives a Member's
// flag, and the reason the projection normalises it here rather than letting
// every caller re-decide what a null means. `commissionPercent` falls back to
// the collection's own default of 10 (ADR-0008).

import type { PartnerRecord, PartnersRepo } from '../partners'
import { payloadClient, type PayloadClient } from './client'

const DEFAULT_COMMISSION_PERCENT = 10

function toRecord(doc: Record<string, unknown>): PartnerRecord {
  const commission = Number(doc.commissionPercent)
  return {
    id: String(doc.id),
    name: (doc.name as string) ?? `Partner ${String(doc.id)}`,
    active: doc.active !== false,
    commissionPercent: Number.isFinite(commission) ? commission : DEFAULT_COMMISSION_PERCENT,
  }
}

export function createPartnersRepo(
  load: () => Promise<PayloadClient> = payloadClient,
): PartnersRepo {
  return {
    async byId(id) {
      const payload = await load()
      try {
        const doc = await payload.findByID({ collection: 'partners', id, depth: 0 })
        if (!doc) return null
        return toRecord(doc as unknown as Record<string, unknown>)
      } catch {
        // A dangling link (the Partners row was deleted) is not an error page:
        // it is "this login owns nothing", which the screen states in a sentence.
        return null
      }
    },

    async activeList() {
      const payload = await load()
      // `active` defaults to true, so the filter has to be "not false" rather
      // than "equals true" — an older row saved before the field existed has a
      // null there and is still a live partner.
      const result = await payload.find({
        collection: 'partners',
        where: { active: { not_equals: false } },
        sort: 'name',
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      return (result.docs as unknown as Record<string, unknown>[]).map(toRecord)
    },
  }
}
