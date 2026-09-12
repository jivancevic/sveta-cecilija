// Single entry point + gating chokepoint for the dev strip (#244, ADR-0016).
// Returns null for anyone without the `dev` permission (so the caller renders
// nothing and, crucially, never even runs the diagnostic queries for a ticket
// admin, the door account or a partner). For a `dev` holder it bundles every
// section, with each sub-fetch independently fail-soft so one broken probe
// can't blank the whole strip or break the dashboard.
import { can, type PermissionUser } from '../access/permissions'
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
  user: PermissionUser,
  deps: GatherDevDiagnosticsDeps,
): Promise<DevDiagnostics | null> {
  if (!can(user, 'dev')) return null

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
