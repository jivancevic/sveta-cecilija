// Review-email soft opt-in / unsubscribe (#148, ADR-0008).
//
// The post-show review email is a soft opt-in: a buyer who bought (or claimed)
// a ticket may receive one follow-up, and every such email carries a working
// unsubscribe link backed by a per-order token. Clicking it sets
// `orders.review_opt_out`; the dispatcher then skips that order.
//
// Pure + DI so the token→order resolution and idempotency are unit-tested
// without a DB; the route wires the raw SQL.

export type OptOutResult = 'OK' | 'NOT_FOUND'

export interface ResolveOptOutDeps {
  /**
   * Sets review_opt_out=true for the order owning `token`, returning whether a
   * matching order existed. MUST be a single atomic statement
   * (`UPDATE orders SET review_opt_out = true WHERE review_opt_out_token = $1
   *   RETURNING id`) so a re-click is idempotent: the row matches on every call
   * regardless of the flag's prior value.
   */
  markOptedOut: (token: string) => Promise<boolean>
}

/**
 * Resolve an unsubscribe token to an opt-out. Idempotent (a repeat click is
 * still OK). Returns NOT_FOUND for an unknown/blank token, so the route can
 * render a neutral page without leaking whether the token existed.
 */
export async function resolveOptOut(token: string, deps: ResolveOptOutDeps): Promise<OptOutResult> {
  if (!token?.trim()) return 'NOT_FOUND'
  const found = await deps.markOptedOut(token)
  return found ? 'OK' : 'NOT_FOUND'
}

export interface EnsureOptOutTokenDeps {
  /** Returns the order's existing opt-out token, or null if it has none yet. */
  getExistingToken: (orderId: string) => Promise<string | null>
  /**
   * Atomically sets the token only if the order has none
   * (`UPDATE orders SET review_opt_out_token = $2 WHERE id = $1 AND
   *   review_opt_out_token IS NULL RETURNING review_opt_out_token`), returning
   * the stored token if this call set it, or null if another writer beat us.
   */
  setTokenIfAbsent: (orderId: string, token: string) => Promise<string | null>
  /** URL-safe random token generator. */
  generateToken: () => string
}

/**
 * Returns a stable opt-out token for the order, generating + persisting one on
 * first call and returning the existing one thereafter. Race-safe: if a
 * concurrent writer set the token first, we re-read and return theirs, so the
 * same order never ends up with two tokens.
 */
export async function ensureOptOutToken(orderId: string, deps: EnsureOptOutTokenDeps): Promise<string> {
  const existing = await deps.getExistingToken(orderId)
  if (existing) return existing
  const set = await deps.setTokenIfAbsent(orderId, deps.generateToken())
  if (set) return set
  // Lost the race — another writer set it; read theirs.
  const other = await deps.getExistingToken(orderId)
  if (other) return other
  throw new Error(`Could not establish an opt-out token for order ${orderId}`)
}
