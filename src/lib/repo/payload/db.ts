// The Payload-backed `DbRepo` (#475).
//
// Three adapters over the connection Payload already holds open. No SQL lives
// here: the statements stay in the modules that own them, which is the second
// rule of the seam.

import type { DbRepo } from '../db'
import { connectOf, drizzleOf, payloadClient, poolOf, type PayloadClient } from './client'

export function createDbRepo(load: () => Promise<PayloadClient> = payloadClient): DbRepo {
  return {
    query: async (sql, params) => {
      const payload = await load()
      return poolOf(payload)(sql, params)
    },
    execute: async (query) => {
      const payload = await load()
      return drizzleOf(payload)(query)
    },
    connect: async () => {
      const payload = await load()
      return connectOf(payload)()
    },
  }
}
