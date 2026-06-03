// Marketing-class email consent (#57, soft opt-in). An opt-out is keyed by
// lowercased email in `marketing_optouts` and persists across every future show
// (a per-order flag wouldn't carry the preference forward, since each show is a
// fresh Orders row). This is the single, reusable check that gates a post-show
// send — pure + DI so it's unit-testable and so the *send seam* can enforce
// consent, not just the dispatch query.
//
// Recorded by /api/unsubscribe (INSERT … ON CONFLICT DO NOTHING). Read here.

export type OptOutQuery = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>

/**
 * True if the email has opted out of marketing-class mail. Normalizes case
 * (opt-outs are stored lowercased). An empty/blank email is treated as not
 * opted out — there is nothing to match — and the caller should reject it on
 * its own grounds. Throws if the query fails: a consent check that can't reach
 * the store must NOT silently report "not opted out" (callers fail closed).
 */
export async function isEmailOptedOut(query: OptOutQuery, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const res = await query(`SELECT 1 FROM marketing_optouts WHERE email = $1 LIMIT 1`, [normalized])
  return res.rows.length > 0
}
