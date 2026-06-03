// Stripe balance for the superadmin dev strip (#244): available / pending EUR.
// Briefly cached (the strip renders on every /admin load and the balance barely
// moves; a live Stripe call per page would be wasteful and rate-limit-prone).
//
// Split into a pure summariser + a cache factory (both unit-testable) and a
// module-level singleton the dashboard uses. Fail-soft: a Stripe error serves
// the last good value, or null — it must never break the dashboard.
import { getStripe } from '../stripe'

export interface StripeBalanceSummary {
  /** Available balance in EUR major units (e.g. 12.34), or null if no EUR funds. */
  availableEur: number | null
  /** Pending balance in EUR major units, or null if no EUR funds. */
  pendingEur: number | null
  /** ISO 8601 UTC of when this snapshot was fetched. */
  fetchedAt: string
}

// Stripe returns balances as an array of {amount(cents), currency} per currency.
type BalanceAmount = { amount: number; currency: string }
interface StripeBalanceLike {
  available: BalanceAmount[]
  pending: BalanceAmount[]
}

export function summarizeStripeBalance(
  balance: StripeBalanceLike,
  fetchedAt: string,
): StripeBalanceSummary {
  return {
    availableEur: sumEur(balance.available),
    pendingEur: sumEur(balance.pending),
    fetchedAt,
  }
}

function sumEur(amounts: BalanceAmount[] | undefined): number | null {
  const eur = (amounts ?? []).filter((a) => a.currency === 'eur')
  if (eur.length === 0) return null
  return eur.reduce((sum, a) => sum + a.amount, 0) / 100
}

export interface BalanceCacheDeps {
  retrieve: () => Promise<StripeBalanceLike>
  now?: () => number
  ttlMs?: number
}

export function createStripeBalanceCache(deps: BalanceCacheDeps): () => Promise<StripeBalanceSummary | null> {
  const now = deps.now ?? Date.now
  const ttlMs = deps.ttlMs ?? 60_000
  let cache: { value: StripeBalanceSummary; at: number } | null = null

  return async function get(): Promise<StripeBalanceSummary | null> {
    const t = now()
    if (cache && t - cache.at < ttlMs) return cache.value
    try {
      const value = summarizeStripeBalance(await deps.retrieve(), new Date(t).toISOString())
      cache = { value, at: t }
      return value
    } catch (err) {
      console.error('[stripe-balance] retrieve failed', err instanceof Error ? err.message : err)
      // Serve the last good value if we have one; otherwise signal "unavailable".
      return cache?.value ?? null
    }
  }
}

// Module singleton so the cache survives across requests within a server process.
let singleton: (() => Promise<StripeBalanceSummary | null>) | null = null

export function getStripeBalanceSummary(): Promise<StripeBalanceSummary | null> {
  if (!singleton) {
    singleton = createStripeBalanceCache({
      retrieve: () => getStripe().balance.retrieve() as Promise<StripeBalanceLike>,
    })
  }
  return singleton()
}
