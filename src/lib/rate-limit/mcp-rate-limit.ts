// Rate-limit policy for the MCP endpoint (#438).
//
// `/api/mcp` is authenticated, so this is not the anti-enumeration throttle
// `forgot-rate-limit.ts` is. It is a blast radius limit: a model in a loop can
// call a tool as fast as the network allows, and every call costs the roster
// database several queries. 120 calls a minute is far above anything a voditelj
// dictating a postava produces (a lineup is one `set_lineup`, a season one
// `list_performances`) and far below anything that hurts a small box.
//
// The key is the TOKEN ROW ID, and it is only ever taken AFTER the token has
// verified (#445 review). Two reasons, and the second is the important one:
// one connector is one budget, so a runaway session cannot spend the budget of
// the voditelj sitting next to it; and a key derived from an UNVERIFIED bearer
// would let a loop of random strings mint a new key per request. The window log
// evicts stale keys either way (`sliding-window.ts`), but the set of keys that
// can exist at all is now exactly the set of issued tokens.
//
// Unlike the forgot route, a throttled caller here gets an honest **429**: the
// caller is authenticated, it already knows it exists, and a model that is told
// "too many requests" can wait, while a silent success would make it retry.

import { createSlidingWindowLimiter } from './sliding-window'

export interface McpRateLimitOptions {
  /** Max tool calls per token per window (default 120). */
  limit?: number
  /** Window length in ms (default one minute). */
  windowMs?: number
  /** Injectable clock (defaults to Date.now). */
  now?: () => number
}

export interface McpRateLimiter {
  /** True when this token may make another call. `tokenId` is the ROW id. */
  allow: (tokenId: string) => boolean
  /** How many tokens the window currently remembers. Tests only. */
  size: () => number
}

export function createMcpRateLimiter(opts: McpRateLimitOptions = {}): McpRateLimiter {
  const window = createSlidingWindowLimiter({
    limit: opts.limit ?? 120,
    windowMs: opts.windowMs ?? 60 * 1000,
    now: opts.now,
  })
  return {
    allow: (tokenId) => window.hit(`mcp:${tokenId}`).allowed,
    size: () => window.size(),
  }
}

/** Process-local singleton used by the MCP route (single-instance, ADR-0009). */
export const mcpRateLimiter = createMcpRateLimiter()
