// Rate-limit for the unauthenticated self-serve refund endpoint (ADR-0021).
// Same per-token + per-IP sliding-window policy as the ticket-claim limiter — a
// refund is allowed only if BOTH budgets have room. Reuses the claim factory so
// there is one limiter implementation; only the process-local singleton is
// distinct (a refund attempt must not consume a claim's budget or vice versa).
//
// A single legitimate self-refund is one POST, well under both limits; the throttle
// only bites a script hammering a leaked token or one host probing many tokens.

import { createClaimRateLimiter } from './claim-rate-limit'

/** Process-local singleton used by the refund route. */
export const refundRateLimiter = createClaimRateLimiter({ perTokenLimit: 5, perIpLimit: 20 })

export { clientIpFromHeaders } from './claim-rate-limit'
