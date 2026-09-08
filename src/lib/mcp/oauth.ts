// THE OAuth 2.1 authorization server behind the MCP connector (#438, ADR-0024).
//
// Ported from Sufler (`voxford-assistent/src/lib/oauth.ts`), which is what
// ADR-0024 asks for. WHAT is different from that original and WHY — the
// one-year token, the deleted refresh path, the public client, the hashed
// codes — is written down once, in `docs/agents/moreskant-app.md` → *MCP and
// OAuth*. What matters when reading THIS file:
//
//   - the subject of a token is a Payload user id;
//   - a token carries no permission, only an identity (`mcp/gate.ts`);
//   - `takeCode` is a `DELETE … RETURNING`, so single use is a property of one
//     statement rather than of the caller;
//   - the audience (`resource`) is stored AND compared.
//
// Everything below is pure over an injected {@link OAuthStore}, so the whole
// flow is unit-testable without Postgres (`oauth.test.ts`, Sufler's tests minus
// refresh). The SQL lives in `oauth-store.ts`.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** The scope the connector asks for; the only one this server grants. */
export const SUPPORTED_SCOPES = ['mcp'] as const

/** Five minutes: long enough for a browser redirect, short enough to be cheap. */
export const CODE_TTL_MS = 5 * 60 * 1000

/** One year (#430, story 59): the connection has to survive a season. */
export const ACCESS_TTL_MS = 365 * 24 * 60 * 60 * 1000

// --- helpers ---

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A URL-safe random credential. 32 bytes = 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes))
}

/** Constant-time string comparison that never throws on a length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** PKCE S256: base64url(SHA256(verifier)) must equal the stored challenge. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = base64url(createHash('sha256').update(verifier).digest())
  return safeEqual(computed, challenge)
}

// --- the fixed client ---

/**
 * The one client id this server knows, from `MCP_CLIENT_ID`.
 *
 * Fail-fast rather than a default: a deployment that forgot the variable must
 * refuse the flow, never accept an empty client id from anybody who asks.
 */
export function mcpClientId(): string {
  const id = process.env.MCP_CLIENT_ID
  if (!id) throw new Error('MCP_CLIENT_ID nije postavljen.')
  return id
}

/** True for the configured client id, in constant time. */
export function verifyClient(clientId: string): boolean {
  return safeEqual(clientId, mcpClientId())
}

/**
 * The redirect allow-list, from `MCP_REDIRECT_URIS` (comma separated).
 *
 * An allow-list rather than one constant, because the Claude app's callback
 * (`https://claude.ai/api/mcp/auth_callback`) and a developer's local client are
 * both legitimate and neither belongs in the source. Empty entries are dropped;
 * an unset variable is a fail-fast for the same reason as the client id.
 */
export function mcpRedirectUris(): string[] {
  const raw = process.env.MCP_REDIRECT_URIS
  if (!raw) throw new Error('MCP_REDIRECT_URIS nije postavljen.')
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  if (list.length === 0) throw new Error('MCP_REDIRECT_URIS je prazan.')
  return list
}

/**
 * Exact-match membership of the allow-list.
 *
 * Exact, never a prefix or an origin test: a prefix match on
 * `https://claude.ai/` would accept any path on that host, and an open redirect
 * in an OAuth authorization endpoint hands the code to whoever asked for it.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  return mcpRedirectUris().includes(uri)
}

/** The origin this authorization server issues from, e.g. `https://moreska.eu`. */
export function issuerUrl(): string {
  const url = process.env.NEXT_PUBLIC_BASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_BASE_URL nije postavljen.')
  return url.replace(/\/$/, '')
}

/**
 * The MCP endpoint's own URL — the RFC 8707/9728 `resource`.
 *
 * `mcp-handler` serves the Streamable HTTP transport at `<basePath>/mcp`, so
 * the resource is `/api/mcp/mcp` even though a voditelj types `/api/mcp` into
 * the Claude app (the connector appends the transport segment itself).
 */
export function mcpResourceUrl(): string {
  return `${issuerUrl()}/api/mcp/mcp`
}

/**
 * Rebuild the `/app/authorize` URL carrying the original OAuth parameters, so a
 * visitor who has to sign in first resumes the consent flow instead of landing
 * on a 500 or an empty form.
 *
 * The destination path is ALWAYS the fixed same-origin `/app/authorize`;
 * user-controlled values only ever ride in the query string and are
 * re-validated on return, so this can never become an open redirect.
 */
export function authorizeReturnTo(
  params: Record<string, string | string[] | undefined>,
): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value
    if (v) qs.set(key, v)
  }
  const q = qs.toString()
  return q ? `/app/authorize?${q}` : '/app/authorize'
}

// --- the store seam ---

/** One pending authorization code, as it is stored (the code itself hashed). */
export interface OAuthCodeRow {
  clientId: string
  userId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
  resource: string | null
  scope: string | null
  /** Epoch ms. */
  expiresAt: number
}

/** One issued access token, as it is stored (the token itself hashed). */
export interface OAuthTokenRow {
  id: string
  clientId: string
  userId: string
  resource: string | null
  scope: string | null
  /** Epoch ms. */
  expiresAt: number
}

export interface OAuthStore {
  insertCode: (codeHash: string, row: OAuthCodeRow) => Promise<void>
  /**
   * Read AND delete one code in a single statement (`DELETE … RETURNING`).
   *
   * Single-use is a property of this one call rather than of the caller's
   * discipline: two redemptions of the same code race, and only the one whose
   * DELETE removed the row may see it.
   */
  takeCode: (codeHash: string) => Promise<OAuthCodeRow | null>
  insertToken: (tokenHash: string, row: Omit<OAuthTokenRow, 'id'>) => Promise<void>
  findToken: (tokenHash: string) => Promise<OAuthTokenRow | null>
}

// --- the flow ---

export interface IssueCodeParams {
  clientId: string
  userId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
  resource?: string | null
  scope?: string | null
}

/** Issue an authorization code for a user who has just pressed "Dopusti". */
export async function issueAuthorizationCode(
  store: OAuthStore,
  params: IssueCodeParams,
  now: () => number = Date.now,
): Promise<string> {
  const code = randomToken()
  await store.insertCode(sha256(code), {
    clientId: params.clientId,
    userId: params.userId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    resource: params.resource ?? null,
    scope: params.scope ?? null,
    expiresAt: now() + CODE_TTL_MS,
  })
  return code
}

export interface TokenResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  scope?: string
}

/**
 * The OAuth error codes this server ever answers with.
 *
 * `invalid_client` is deliberately absent: the client is public and identified
 * rather than authenticated, so a wrong client id is refused by the route
 * before the grant runs and never becomes an {@link OAuthError} (#445 review).
 */
export type OAuthErrorCode = 'invalid_grant' | 'invalid_request'

export class OAuthError extends Error {
  constructor(public readonly code: OAuthErrorCode) {
    super(code)
    this.name = 'OAuthError'
  }
}

/**
 * The single grant: `authorization_code` + PKCE S256.
 *
 * The code is consumed whatever happens next, so a wrong verifier costs the
 * attacker the code as well. Every refusal is `invalid_grant` unless the
 * request itself is malformed — an OAuth client learns nothing from which of
 * the five checks failed, and neither does anybody replaying codes.
 */
export async function exchangeAuthorizationCode(
  store: OAuthStore,
  params: { code: string; redirectUri: string; codeVerifier: string; clientId: string },
  now: () => number = Date.now,
): Promise<TokenResponse> {
  const row = await store.takeCode(sha256(params.code))
  if (!row) throw new OAuthError('invalid_grant')
  if (row.expiresAt < now()) throw new OAuthError('invalid_grant')
  if (row.clientId !== params.clientId) throw new OAuthError('invalid_grant')
  if (row.redirectUri !== params.redirectUri) throw new OAuthError('invalid_grant')
  if (row.codeChallengeMethod !== 'S256') throw new OAuthError('invalid_request')
  if (!verifyPkceS256(params.codeVerifier, row.codeChallenge)) {
    throw new OAuthError('invalid_grant')
  }

  const accessToken = randomToken()
  const expiresAt = now() + ACCESS_TTL_MS
  await store.insertToken(sha256(accessToken), {
    clientId: row.clientId,
    userId: row.userId,
    resource: row.resource,
    scope: row.scope,
    expiresAt,
  })

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    scope: row.scope ?? undefined,
  }
}

export interface VerifiedToken {
  tokenId: string
  userId: string
  clientId: string
  scopes: string[]
  resource: string | null
  /** Epoch SECONDS, which is what `AuthInfo` wants. */
  expiresAt: number
}

/**
 * Bearer token → identity, for the MCP route's `verifyToken` callback.
 *
 * `undefined` means 401, and it covers all three of "no such token", "expired"
 * and "revoked" (a revoked token is a deleted row). Who the user may still BE
 * is a separate question the route asks afterwards, because a permission taken
 * away in `/admin` has to bite the next call without anybody hunting for a
 * token row.
 */
export async function verifyAccessToken(
  store: OAuthStore,
  token: string,
  now: () => number = Date.now,
  expectedResource?: string,
): Promise<VerifiedToken | undefined> {
  const row = await store.findToken(sha256(token))
  if (!row) return undefined
  if (row.expiresAt < now()) return undefined
  // RFC 8707 audience binding, actually enforced (#445 review): a token issued
  // for another resource is not a token for this one. Without the comparison
  // the stored value would be decoration — and a deployment whose public URL
  // moved would keep honouring tokens minted for the old audience.
  if (expectedResource !== undefined && row.resource !== expectedResource) return undefined
  return {
    tokenId: row.id,
    userId: row.userId,
    clientId: row.clientId,
    scopes: row.scope ? row.scope.split(' ') : [...SUPPORTED_SCOPES],
    resource: row.resource,
    expiresAt: Math.floor(row.expiresAt / 1000),
  }
}

/** Keep only scopes this server actually grants; empty falls back to `mcp`. */
export function grantedScope(requested: string | null | undefined): string {
  const kept = (requested ?? '')
    .split(' ')
    .filter((s) => (SUPPORTED_SCOPES as readonly string[]).includes(s))
  return kept.length > 0 ? kept.join(' ') : SUPPORTED_SCOPES.join(' ')
}
