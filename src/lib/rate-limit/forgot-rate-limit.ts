// Rate-limit policy for "Zaboravljena lozinka" (#424).
//
// `/api/app/forgot` is an unauthenticated POST that makes the server write a
// row and send mail to an address the caller does not have to prove they own.
// Left open it is a free mail cannon at one dancer's inbox, and a cheap way to
// keep invalidating the token a voditelj just issued.
//
// Two sliding windows, the `claim-rate-limit.ts` shape: a request is allowed
// only when BOTH have room. Per identifier (3/hour) stops one account being
// mailed over and over; per IP (10/hour) stops one host walking a list of
// usernames. A dancer who really did forget their password uses one hit and is
// never near either limit.
//
// Blocked requests answer the SAME 200 body as everything else on this route
// (see `src/lib/app/forgot.ts`): a 429 would tell the caller their guess was
// worth throttling, and the whole point of that endpoint is that it says
// nothing about who exists.

import { createSlidingWindowLimiter } from './sliding-window'

export interface ForgotRateLimitOptions {
  /** Max reset requests per identifier per window (default 3). */
  perIdentifierLimit?: number
  /** Max reset requests per IP per window (default 10). */
  perIpLimit?: number
  /** Window length in ms (default one hour, the life of a reset link). */
  windowMs?: number
  /** Injectable clock (defaults to Date.now). */
  now?: () => number
}

export interface ForgotRateLimiter {
  /** True when this identifier, from this IP, may still ask for a link. */
  allow: (identifier: string, ip: string) => boolean
}

export function createForgotRateLimiter(opts: ForgotRateLimitOptions = {}): ForgotRateLimiter {
  const windowMs = opts.windowMs ?? 60 * 60 * 1000
  const now = opts.now
  const perIdentifier = createSlidingWindowLimiter({
    limit: opts.perIdentifierLimit ?? 3,
    windowMs,
    now,
  })
  const perIp = createSlidingWindowLimiter({ limit: opts.perIpLimit ?? 10, windowMs, now })

  return {
    allow(identifier: string, ip: string): boolean {
      // Hit both every time, so a flood on either dimension keeps its window
      // full instead of refilling while the other one blocks.
      const byIdentifier = perIdentifier.hit(`id:${identifier.trim().toLowerCase()}`)
      const byIp = perIp.hit(`ip:${ip}`)
      return byIdentifier.allowed && byIp.allowed
    },
  }
}

/** Process-local singleton used by the forgot route (single-instance, ADR-0009). */
export const forgotRateLimiter = createForgotRateLimiter()
