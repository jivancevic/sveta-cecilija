// The Payload-backed `CompRepo` (#506, #475).
//
// Three adapters and no SQL: the statements live in `lib/comp/comp-report.ts`,
// the module that owns them, and all this does is hand them the pool Payload
// already holds open. That is the seam's second rule, and it is what keeps the
// queries readable next to the rule they serve.

import { getCompTicketsInSeason, getFirstCompSeason, getRecentComps } from '@/lib/comp/comp-report'
import type { CompRepo } from '../comp'
import { payloadClient, poolOf, type PayloadClient } from './client'

export function createCompRepo(load: () => Promise<PayloadClient> = payloadClient): CompRepo {
  const pool = async () => poolOf(await load())
  return {
    async recent(limit) {
      return getRecentComps(await pool(), limit)
    },
    async ticketsInSeason(season) {
      return getCompTicketsInSeason(await pool(), season)
    },
    async firstSeason() {
      return getFirstCompSeason(await pool())
    },
  }
}
