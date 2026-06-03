// Per-show seat-sell serialization (#179). Selling reads remaining capacity
// (count active tickets) and then inserts tickets in a separate step; with no
// lock, two concurrent sells of the last seats can both pass the guard and both
// insert → oversell. This wraps the count→check→insert critical section in a
// Postgres *advisory* lock keyed on the show id, held on a single dedicated
// connection, so concurrent sells of the SAME show queue (the second sees the
// first's committed tickets). Different shows use different keys, so they never
// contend → no deadlock. The lock is advisory (not a row lock) so it doesn't
// depend on touching the `shows` row and composes with Payload's own inserts on
// other pooled connections — they commit before we release, so the next lock
// holder's recount sees them.

/** Minimal slice of node-postgres we depend on, so this is unit-testable. */
export interface SellLockClient {
  query: (sql: string, params?: unknown[]) => Promise<unknown>
  release?: () => void
}
export interface SellLockPool {
  connect: () => Promise<SellLockClient>
}

// First key of pg_advisory_lock's two-int form — a private namespace for
// seat-sell locks so they never collide with any other advisory-lock user.
export const SEAT_SELL_LOCK_NAMESPACE = 7799

/**
 * Run `critical` while holding the seat-sell advisory lock for `showId`.
 * Always releases the lock and returns the connection to the pool, even if
 * `critical` throws.
 */
export async function withShowSellLock<T>(
  pool: SellLockPool,
  showId: number,
  critical: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [SEAT_SELL_LOCK_NAMESPACE, showId])
    try {
      return await critical()
    } finally {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [SEAT_SELL_LOCK_NAMESPACE, showId])
    }
  } finally {
    client.release?.()
  }
}
