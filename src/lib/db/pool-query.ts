// The one-method view of the Postgres pool Payload already holds open.
//
// Raw tables (`marketing_optouts`, `push_subscriptions`,
// `performance_notifications`, `oauth_codes`, `oauth_tokens`) are read and
// written with plain parameterised SQL rather than through the CMS, and every
// one of those stores wants the same two lines to reach the pool. They live
// here so a store can be handed a query function by a route, by the cron job or
// by a probe script without dragging Payload along, and so "how do I get the
// pool" is answered once.

export interface PoolQuery {
  (
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>
}

/** The pool Payload holds open, typed down to the one method we use. */
export function poolQuery(payload: unknown): PoolQuery {
  const pool = (payload as { db?: { pool?: { query: PoolQuery } } }).db?.pool
  if (!pool) throw new Error('No Postgres pool on the Payload instance')
  return (sql, params) => pool.query(sql, params ?? [])
}
