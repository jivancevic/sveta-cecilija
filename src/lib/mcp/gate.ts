// The three decisions the MCP route makes before any tool runs (#438, #445
// review), pulled out of the route so each is a pure function with a table.
//
// The route itself imports the Payload config, so nothing in it is unit
// testable; these are exactly the parts where a subtle mistake is invisible
// until somebody is either locked out or let in.

/**
 * The scope that stands for "the token's user still holds `moreska`".
 *
 * It is a required SCOPE rather than a check inside `verifyToken` for one
 * reason: `withMcpAuth` turns an unknown token into 401 and a missing required
 * scope into **403**, and those two answers mean genuinely different things. An
 * exception thrown from `verifyToken` is swallowed into a 401, so "the token is
 * real, the person is no longer a voditelj" would otherwise read exactly like
 * "there is no such token".
 */
export const MORESKA_SCOPE = 'moreska'

/**
 * The scopes an `AuthInfo` carries: the stored ones, **stripped of
 * {@link MORESKA_SCOPE}**, plus that scope only while the account holds the
 * permission right now.
 *
 * The strip is the point (#445 review). The scope is a live reading of the
 * permission set, never something a token may carry: without it, a `moreska`
 * string that reached a token row — a hand-edited row, a future writer that
 * stores the granted scope verbatim — would satisfy the gate on its own and a
 * revoked voditelj would keep their connector.
 */
export function mcpAuthScopes(stored: readonly string[], isVoditelj: boolean): string[] {
  const kept = stored.filter((s) => s !== MORESKA_SCOPE)
  return isVoditelj ? [...kept, MORESKA_SCOPE] : kept
}

/**
 * True when a failure to load the token's user must be RETHROWN rather than
 * read as "no user".
 *
 * A deleted account is a 404 and genuinely means "no user", which the missing
 * scope then reports as 403. Anything else — a dead pool, a timeout, a bug — is
 * not that, and swallowing it would tell a voditelj they are no longer a
 * voditelj because Postgres hiccuped. Rethrown, it is logged by `withMcpAuth`
 * and answered as an auth failure rather than as a permission decision.
 */
export function isMissingUserError(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 404
}

/** The bearer token of an `Authorization` header, or `''`. Case-insensitive. */
export function bearerToken(header: string | null | undefined): string {
  if (!header) return ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}
