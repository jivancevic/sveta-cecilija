// Rate-limit policy for the unauthenticated ticket-claim endpoint (#184).
// Combines a per-token and a per-IP sliding window: a claim is allowed only if
// BOTH budgets have room. Per-token stops repeatedly hammering one slip; per-IP
// stops one host hammering many tokens. A single legitimate claim (1 attempt)
// is always under both limits.
//
// Factory + injectable clock so it's unit-testable; the route holds one
// process-local singleton (fine on single-instance Coolify, ADR-0009).

import { createSlidingWindowLimiter } from './sliding-window'

export interface ClaimRateLimitOptions {
  /** Max claim attempts per token per window (default 5). */
  perTokenLimit?: number
  /** Max claim attempts per IP per window (default 20). */
  perIpLimit?: number
  /** Window length in ms (default 60s). */
  windowMs?: number
  /** Injectable clock (defaults to Date.now). */
  now?: () => number
}

export interface ClaimRateDecision {
  allowed: boolean
  /** Seconds to advertise in a Retry-After header when blocked (0 when allowed). */
  retryAfterSec: number
}

export interface ClaimRateLimiter {
  check: (token: string, ip: string) => ClaimRateDecision
}

export function createClaimRateLimiter(opts: ClaimRateLimitOptions = {}): ClaimRateLimiter {
  const windowMs = opts.windowMs ?? 60_000
  const now = opts.now
  const perToken = createSlidingWindowLimiter({ limit: opts.perTokenLimit ?? 5, windowMs, now })
  const perIp = createSlidingWindowLimiter({ limit: opts.perIpLimit ?? 20, windowMs, now })

  return {
    check(token: string, ip: string): ClaimRateDecision {
      // Always hit both so a flood on either dimension keeps counting.
      const t = perToken.hit(`token:${token}`)
      const i = perIp.hit(`ip:${ip}`)
      const allowed = t.allowed && i.allowed
      const retryAfterMs = Math.max(t.retryAfterMs, i.retryAfterMs)
      return { allowed, retryAfterSec: allowed ? 0 : Math.ceil(retryAfterMs / 1000) }
    },
  }
}

/** Process-local singleton used by the claim route. */
export const claimRateLimiter = createClaimRateLimiter()

/** Best-effort client IP from proxy headers (Traefik sets x-forwarded-for). */
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}
