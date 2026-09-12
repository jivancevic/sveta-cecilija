// Rate-limit policy for the rehearsal join code (#463).
//
// `/api/app/join` is an unauthenticated POST that writes a row, the shape
// `forgot-rate-limit.ts` already covers. The numbers are different, and the
// reason is the room:
//
// **A rehearsal is one IP.** Twenty dancers on the hall's wifi, or on the same
// carrier NAT, arrive as one address. The forgot route's ten an hour would lock
// the back half of the roster out of the very evening this feature exists for,
// and they would read it as the app being broken. So the per-IP budget is
// generous (60/hour) and the work of keeping the endpoint boring is done by the
// code itself, which is short-lived and rotatable, and by the human approval
// behind it: a flood of claims is a flood of rows in front of a voditelj who
// recognises none of the names and approves none of them.
//
// The per-code window (200/hour) is the blunt stop: past that, something is
// hammering the endpoint rather than joining a rehearsal.
//
// Unlike the forgot route, a blocked caller here is told so with a 429. That
// route's silence exists to keep it from answering "does this account exist";
// this one has nothing to hide, because whoever holds a live code is already
// looking at the list of names.

import { createSlidingWindowLimiter } from './sliding-window'

export interface JoinRateLimitOptions {
  /** Max claims per code per window (default 200). */
  perCodeLimit?: number
  /** Max claims per IP per window (default 60; a whole rehearsal is one IP). */
  perIpLimit?: number
  /** Window length in ms (default one hour). */
  windowMs?: number
  /** Injectable clock (defaults to Date.now). */
  now?: () => number
}

export interface JoinRateLimiter {
  /** True when this code, from this IP, may still take a claim. */
  allow: (code: string, ip: string) => boolean
}

export function createJoinRateLimiter(opts: JoinRateLimitOptions = {}): JoinRateLimiter {
  const windowMs = opts.windowMs ?? 60 * 60 * 1000
  const now = opts.now
  const perCode = createSlidingWindowLimiter({ limit: opts.perCodeLimit ?? 200, windowMs, now })
  const perIp = createSlidingWindowLimiter({ limit: opts.perIpLimit ?? 60, windowMs, now })

  return {
    allow(code: string, ip: string): boolean {
      // Hit both every time, so a flood on either dimension keeps its window
      // full instead of refilling while the other one blocks.
      const byCode = perCode.hit(`code:${code.trim().toUpperCase()}`)
      const byIp = perIp.hit(`ip:${ip}`)
      return byCode.allowed && byIp.allowed
    },
  }
}

/** Process-local singleton used by the join route (single-instance, ADR-0009). */
export const joinRateLimiter = createJoinRateLimiter()
