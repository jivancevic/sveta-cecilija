// Tiny in-memory sliding-window rate limiter (#184). Prod runs single-instance
// on Coolify, so a process-local limiter is sufficient; swap the store for
// Redis/Postgres if it ever scales out. Pure + DI clock so it's unit-testable
// without sleeping on the wall.
//
// Each key keeps a log of hit timestamps within the window. `hit()` records an
// attempt and reports whether it stayed within the limit — blocked attempts are
// still recorded, so a flood keeps the window full (raises the bar on abuse)
// rather than letting an attacker reset by spacing requests just under refill.

export interface SlidingWindowOptions {
  /** Max allowed hits within the window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
  /** Injectable clock (defaults to Date.now). */
  now?: () => number
}

export interface RateLimitResult {
  allowed: boolean
  /** Remaining allowed hits in the current window (0 when blocked). */
  remaining: number
  /** Milliseconds until the oldest in-window hit ages out (0 when allowed). */
  retryAfterMs: number
}

export interface RateLimiter {
  hit: (key: string) => RateLimitResult
}

export function createSlidingWindowLimiter(opts: SlidingWindowOptions): RateLimiter {
  const { limit, windowMs } = opts
  const now = opts.now ?? Date.now
  const log = new Map<string, number[]>()

  return {
    hit(key: string): RateLimitResult {
      const t = now()
      const cutoff = t - windowMs
      const recent = (log.get(key) ?? []).filter((ts) => ts > cutoff)
      recent.push(t)
      log.set(key, recent)

      const allowed = recent.length <= limit
      const remaining = allowed ? limit - recent.length : 0
      // Oldest in-window hit ages out at recent[0] + windowMs.
      const retryAfterMs = allowed ? 0 : Math.max(0, recent[0] + windowMs - t)
      return { allowed, remaining, retryAfterMs }
    },
  }
}
