// The database half of the seam (#475, ADR-0027).
//
// Three handles, and deliberately nothing more:
//
//   - `query`   — the one-method view of the pool every raw-table store already
//                 takes (`src/lib/db/pool-query.ts`). A store keeps its SQL; it
//                 only stops reaching into `payload.db.pool` to get here.
//   - `execute` — the drizzle executor the atomic ticket statements run on
//                 (`UPDATE tickets … WHERE scanned = false RETURNING …`). The
//                 SQL stays verbatim in the module that owns it; this is how it
//                 reaches a connection.
//   - `connect` — one dedicated connection, which is what the seat-sell
//                 advisory lock needs (`src/lib/tickets/sell-lock.ts`).
//
// The seam must NOT hide the SQL the atomic paths depend on (seam research,
// section 6.1). There is no query builder here and there never will be.

import type { PoolQuery } from '@/lib/db/pool-query'
import type { SellLockClient } from '@/lib/tickets/sell-lock'
import type { TicketVoidExecutor } from '@/lib/tickets/ticket-void'

export interface DbRepo {
  /** Parameterised SQL on the shared pool. */
  query: PoolQuery
  /** The drizzle executor the atomic ticket statements are run on. */
  execute: TicketVoidExecutor['execute']
  /** A dedicated connection, for `withShowSellLock`. */
  connect: () => Promise<SellLockClient>
}

export type { PoolQuery, SellLockClient }
