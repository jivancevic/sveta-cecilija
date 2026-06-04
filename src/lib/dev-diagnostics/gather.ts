// Single entry point + gating chokepoint for the superadmin dev strip (#244).
// Returns null for anyone who is not a superadmin (so the caller renders nothing
// and, crucially, never even runs the diagnostic queries for admin/tehnika/
// partner). For a superadmin it bundles every section, with each sub-fetch
// independently fail-soft so one broken probe can't blank the whole strip or
// break the dashboard.
import { isSuperadmin, type RoleUser } from '../access/roles'
import type { PoolQuery } from '../tickets/sold-seats'
import { resolveEnvInfo, type EnvInfo } from './env-info'
import { getDataIntegrity, type DataIntegrity } from './data-integrity'
import { getIntegrationHealth, type IntegrationHealth } from './integration-health'
import type { StripeBalanceSummary } from './stripe-balance'
import { listRecentCriticalEvents } from '../critical-events/list'
import type { CriticalEventRow } from '../critical-events/list'

export interface DevDiagnostics {
  env: EnvInfo
  integrity: DataIntegrity
  health: IntegrationHealth
  balance: StripeBalanceSummary | null
  criticalEvents: CriticalEventRow[]
}

export interface GatherDevDiagnosticsDeps {
  query: PoolQuery
  /** Cached Stripe balance fetcher (see stripe-balance.ts). */
  stripeBalance: () => Promise<StripeBalanceSummary | null>
  /** Env bag for environment classification; defaults to process.env. */
  env?: Record<string, string | undefined>
}

const EMPTY_INTEGRITY: DataIntegrity = {
  anomalies: { ordersWithoutTickets: 0, ticketsWithoutOrder: 0, pastActiveShows: 0, incompleteRefunds: 0 },
  rowCounts: {},
}
const EMPTY_HEALTH: IntegrationHealth = { lastOnlineOrderAt: null, lastReviewEmailAt: null }

export async function gatherDevDiagnostics(
  user: RoleUser,
  deps: GatherDevDiagnosticsDeps,
): Promise<DevDiagnostics | null> {
  if (!isSuperadmin(user)) return null

  const [integrity, health, balance, criticalEvents] = await Promise.all([
    getDataIntegrity(deps.query).catch((err) => softFail('data integrity', err, EMPTY_INTEGRITY)),
    getIntegrationHealth(deps.query).catch((err) => softFail('integration health', err, EMPTY_HEALTH)),
    deps.stripeBalance().catch((err) => softFail('stripe balance', err, null)),
    listRecentCriticalEvents(deps.query, 20).catch((err) => softFail('critical events', err, [] as CriticalEventRow[])),
  ])

  return { env: resolveEnvInfo(deps.env), integrity, health, balance, criticalEvents }
}

function softFail<T>(label: string, err: unknown, fallback: T): T {
  console.error(`[devDiagnostics] ${label} failed`, err instanceof Error ? err.message : err)
  return fallback
}
