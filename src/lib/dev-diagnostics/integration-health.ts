// Integration health signals for the superadmin dev strip (#244): the freshness
// of the two background integrations that fail silently. Pure + DI (PoolQuery).
//
// Neither integration persists an explicit "last run" timestamp today, so these
// are honest APPROXIMATIONS derived from their side-effects (labelled as such in
// the UI):
//   - lastOnlineOrderAt : max(created_at) over channel='online' orders. The
//     Stripe webhook is the only thing that creates online orders, so this is
//     "≈ last successful webhook". A webhook stuck retrying won't have created a
//     row, so this is a floor, not an exact receipt time.
//   - lastReviewEmailAt : max(review_email_sent_at). The T+24h review-email cron
//     stamps this after each successful send, so it's "≈ last review email sent"
//     (the cron may have run since with nothing to send).
import type { PoolQuery } from '../tickets/sold-seats'

export interface IntegrationHealth {
  /** ISO 8601 UTC, or null if there are no online orders yet. */
  lastOnlineOrderAt: string | null
  /** ISO 8601 UTC, or null if no review email has ever been sent. */
  lastReviewEmailAt: string | null
}

export async function getIntegrationHealth(query: PoolQuery): Promise<IntegrationHealth> {
  const { rows } = await query(`
    SELECT
      (SELECT max(created_at) FROM orders WHERE channel = 'online') AS last_online_order_at,
      (SELECT max(review_email_sent_at) FROM orders)               AS last_review_email_at
  `)
  const r = rows[0] ?? {}
  return {
    lastOnlineOrderAt: toIso(r.last_online_order_at),
    lastReviewEmailAt: toIso(r.last_review_email_at),
  }
}

function toIso(v: unknown): string | null {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  // pg may hand back a timestamptz as a string already.
  const d = new Date(v as string)
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString()
}
