// The one door to Payload (#475, ADR-0027).
//
// This directory is the ONLY place in the codebase that may import `payload` or
// `@payload-config`; `src/lib/repo/repo-guard.test.ts` fails the build for any
// new Cecilija file that does it elsewhere. Everything above the seam talks to
// `getRepo()`.
//
// The three handles below are the ones the rest of `repo/payload/` needs.
// `payload.db.pool` and `payload.db.drizzle` are real and stable but are not in
// Payload's public types, which is why the casts live here rather than being
// re-typed in five modules.

import { getPayload } from 'payload'
import config from '@payload-config'
import { poolQuery, type PoolQuery } from '@/lib/db/pool-query'
import type { SellLockClient } from '@/lib/tickets/sell-lock'
import type { TicketVoidExecutor } from '@/lib/tickets/ticket-void'

export type PayloadClient = Awaited<ReturnType<typeof getPayload>>

/** Payload's own memoised instance. */
export function payloadClient(): Promise<PayloadClient> {
  return getPayload({ config })
}

/** The pool, as the one method every raw store takes. */
export function poolOf(payload: PayloadClient): PoolQuery {
  return poolQuery(payload)
}

/** A dedicated connection, for the seat-sell advisory lock. */
export function connectOf(payload: PayloadClient): () => Promise<SellLockClient> {
  const pool = (payload.db as unknown as { pool?: { connect: () => Promise<SellLockClient> } }).pool
  if (!pool) throw new Error('No Postgres pool on the Payload instance')
  return () => pool.connect()
}

/** The drizzle executor the atomic ticket statements run on. */
export function drizzleOf(payload: PayloadClient): TicketVoidExecutor['execute'] {
  const drizzle = (payload.db as unknown as { drizzle?: TicketVoidExecutor }).drizzle
  if (!drizzle) throw new Error('No drizzle handle on the Payload instance')
  return (query) => drizzle.execute(query)
}
