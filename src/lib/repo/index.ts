// `getRepo()` — the one way Cecilija code reaches the database (#475, ADR-0027).
//
// Memoised the way `getPayload()` is, because the repos are stateless adapters
// over one connection pool and building them per request would be waste. The
// Payload instance itself is fetched lazily inside each call, so importing this
// module costs nothing and a route that never touches the database never opens
// one.
//
// Tests do not need `getRepo()`: the pure modules take the `*Repo` interfaces
// as parameters, so a fake is an object literal. `setRepoForTests` exists for
// the rare integration test that has to stand behind a route handler.

import { createAuthRepo } from './payload/auth'
import { createDbRepo } from './payload/db'
import { createInquiriesRepo } from './payload/inquiries'
import { createOrdersRepo } from './payload/orders'
import { createRosterRepo } from './payload/roster'
import { createPartnersRepo } from './payload/partners'
import { createShowsRepo } from './payload/shows'
import { createStatsRepo } from './payload/stats'
import type { Repo } from './types'

let cached: Repo | null = null

function build(): Repo {
  return {
    auth: createAuthRepo(),
    db: createDbRepo(),
    inquiries: createInquiriesRepo(),
    orders: createOrdersRepo(),
    roster: createRosterRepo(),
    partners: createPartnersRepo(),
    shows: createShowsRepo(),
    stats: createStatsRepo(),
  }
}

export function getRepo(): Repo {
  cached ??= build()
  return cached
}

/** Swap the whole seam out, for a test that drives a real route handler. */
export function setRepoForTests(repo: Repo | null): void {
  cached = repo
}

export type * from './types'
