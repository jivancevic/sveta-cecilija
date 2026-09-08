// Sufler's `oauth.test.ts` ported (#438), minus every refresh case — there is
// no refresh grant here — plus the cases this port added: the redirect
// allow-list, the one-year lifetime, the hashing at rest and single use.

import { createHash, randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACCESS_TTL_MS,
  CODE_TTL_MS,
  OAuthError,
  authorizeReturnTo,
  exchangeAuthorizationCode,
  grantedScope,
  isAllowedRedirectUri,
  issueAuthorizationCode,
  mcpRedirectUris,
  sha256,
  verifyAccessToken,
  verifyClient,
  verifyPkceS256,
  type OAuthCodeRow,
  type OAuthStore,
  type OAuthTokenRow,
} from './oauth'

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function challengeFor(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest())
}

/** An in-memory store with the same single-use semantics as the SQL one. */
function fakeStore() {
  const codes = new Map<string, OAuthCodeRow>()
  const tokens = new Map<string, OAuthTokenRow>()
  let nextId = 1
  const store: OAuthStore = {
    insertCode: async (hash, row) => {
      codes.set(hash, row)
    },
    takeCode: async (hash) => {
      const row = codes.get(hash) ?? null
      codes.delete(hash)
      return row
    },
    insertToken: async (hash, row) => {
      tokens.set(hash, { ...row, id: String(nextId++) })
    },
    findToken: async (hash) => tokens.get(hash) ?? null,
  }
  return { store, codes, tokens }
}

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

beforeEach(() => {
  process.env.MCP_CLIENT_ID = 'klijent-abc'
  process.env.MCP_REDIRECT_URIS = `http://localhost:3438/oauth/callback, ${REDIRECT}`
})

describe('verifyPkceS256', () => {
  it('accepts a correct verifier for its challenge', () => {
    const verifier = b64url(randomBytes(32))
    expect(verifyPkceS256(verifier, challengeFor(verifier))).toBe(true)
  })

  it('rejects a wrong verifier', () => {
    expect(verifyPkceS256('krivi-verifier', challengeFor('pravi-verifier'))).toBe(false)
  })
})

describe('verifyClient', () => {
  it('accepts the configured id', () => {
    expect(verifyClient('klijent-abc')).toBe(true)
  })

  it('rejects any other id', () => {
    expect(verifyClient('drugi')).toBe(false)
    expect(verifyClient('')).toBe(false)
  })

  it('throws rather than accepting anything when the env var is unset', () => {
    delete process.env.MCP_CLIENT_ID
    expect(() => verifyClient('bilo-sto')).toThrow()
  })
})

describe('the redirect allow-list', () => {
  it('splits and trims MCP_REDIRECT_URIS', () => {
    expect(mcpRedirectUris()).toEqual(['http://localhost:3438/oauth/callback', REDIRECT])
  })

  it('accepts a listed URI exactly', () => {
    expect(isAllowedRedirectUri(REDIRECT)).toBe(true)
  })

  it('refuses a prefix, another path on the same host, and a look-alike host', () => {
    expect(isAllowedRedirectUri('https://claude.ai/')).toBe(false)
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback/evil')).toBe(false)
    expect(isAllowedRedirectUri('https://claude.ai.evil.example/api/mcp/auth_callback')).toBe(false)
  })

  it('throws on an unset or empty list rather than allowing everything', () => {
    delete process.env.MCP_REDIRECT_URIS
    expect(() => isAllowedRedirectUri(REDIRECT)).toThrow()
    process.env.MCP_REDIRECT_URIS = ' , '
    expect(() => isAllowedRedirectUri(REDIRECT)).toThrow()
  })
})

describe('authorizeReturnTo', () => {
  it('rebuilds /app/authorize with the original params', () => {
    const url = authorizeReturnTo({
      response_type: 'code',
      client_id: 'abc',
      code_challenge_method: 'S256',
    })
    expect(url.startsWith('/app/authorize?')).toBe(true)
    const q = new URLSearchParams(url.slice('/app/authorize?'.length))
    expect(q.get('response_type')).toBe('code')
    expect(q.get('client_id')).toBe('abc')
    expect(q.get('code_challenge_method')).toBe('S256')
  })

  it('skips empty and undefined params', () => {
    const url = authorizeReturnTo({ client_id: 'abc', state: '', scope: undefined })
    const q = new URLSearchParams(url.slice('/app/authorize?'.length))
    expect(q.get('client_id')).toBe('abc')
    expect(q.has('state')).toBe(false)
    expect(q.has('scope')).toBe(false)
  })

  it('takes the first element when a param is an array', () => {
    const url = authorizeReturnTo({ client_id: ['first', 'second'] })
    expect(new URLSearchParams(url.slice('/app/authorize?'.length)).get('client_id')).toBe('first')
  })

  it('returns the bare path with no params', () => {
    expect(authorizeReturnTo({})).toBe('/app/authorize')
  })

  it('keeps the return URL a relative /app path (no open redirect)', () => {
    const url = authorizeReturnTo({ redirect_uri: 'https://malicious.example' })
    expect(url.startsWith('/app/authorize')).toBe(true)
    expect(url.startsWith('http')).toBe(false)
  })
})

describe('grantedScope', () => {
  it('keeps a supported scope and drops everything else', () => {
    expect(grantedScope('mcp')).toBe('mcp')
    expect(grantedScope('mcp admin')).toBe('mcp')
  })

  it('falls back to mcp for an absent or wholly unsupported request', () => {
    expect(grantedScope(null)).toBe('mcp')
    expect(grantedScope('')).toBe('mcp')
    expect(grantedScope('admin')).toBe('mcp')
  })
})

describe('the authorization code grant', () => {
  const verifier = 'a-verifier-long-enough-to-be-real'
  const base = () => ({
    clientId: 'klijent-abc',
    userId: '7',
    redirectUri: REDIRECT,
    codeChallenge: challengeFor(verifier),
    codeChallengeMethod: 'S256',
    scope: 'mcp',
    resource: 'https://moreska.eu/api/mcp/mcp',
  })

  it('never stores the code in the clear', async () => {
    const { store, codes } = fakeStore()
    const code = await issueAuthorizationCode(store, base())
    expect(codes.has(code)).toBe(false)
    expect(codes.has(sha256(code))).toBe(true)
  })

  it('exchanges a fresh code for an access token and never stores that either', async () => {
    const { store, tokens } = fakeStore()
    const code = await issueAuthorizationCode(store, base())
    const res = await exchangeAuthorizationCode(store, {
      code,
      redirectUri: REDIRECT,
      codeVerifier: verifier,
      clientId: 'klijent-abc',
    })
    expect(res.token_type).toBe('Bearer')
    expect(res.scope).toBe('mcp')
    expect(tokens.has(res.access_token)).toBe(false)
    expect(tokens.has(sha256(res.access_token))).toBe(true)
  })

  it('issues a token that lives a year and carries no refresh token', async () => {
    const { store } = fakeStore()
    const code = await issueAuthorizationCode(store, base())
    const res = await exchangeAuthorizationCode(store, {
      code,
      redirectUri: REDIRECT,
      codeVerifier: verifier,
      clientId: 'klijent-abc',
    })
    expect(res.expires_in).toBe(365 * 24 * 60 * 60)
    expect(ACCESS_TTL_MS).toBe(365 * 24 * 60 * 60 * 1000)
    expect('refresh_token' in res).toBe(false)
  })

  it('consumes the code, so a replay is invalid_grant', async () => {
    const { store } = fakeStore()
    const code = await issueAuthorizationCode(store, base())
    const params = {
      code,
      redirectUri: REDIRECT,
      codeVerifier: verifier,
      clientId: 'klijent-abc',
    }
    await exchangeAuthorizationCode(store, params)
    await expect(exchangeAuthorizationCode(store, params)).rejects.toMatchObject({
      code: 'invalid_grant',
    })
  })

  it('consumes the code even when the verifier is wrong', async () => {
    const { store, codes } = fakeStore()
    const code = await issueAuthorizationCode(store, base())
    await expect(
      exchangeAuthorizationCode(store, {
        code,
        redirectUri: REDIRECT,
        codeVerifier: 'kriv',
        clientId: 'klijent-abc',
      }),
    ).rejects.toBeInstanceOf(OAuthError)
    expect(codes.size).toBe(0)
  })

  it('refuses an expired code', async () => {
    const { store } = fakeStore()
    const t0 = 1_000_000
    const code = await issueAuthorizationCode(store, base(), () => t0)
    await expect(
      exchangeAuthorizationCode(
        store,
        { code, redirectUri: REDIRECT, codeVerifier: verifier, clientId: 'klijent-abc' },
        () => t0 + CODE_TTL_MS + 1,
      ),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('refuses a redirect_uri that differs from the one the code was issued for', async () => {
    const { store } = fakeStore()
    const code = await issueAuthorizationCode(store, base())
    await expect(
      exchangeAuthorizationCode(store, {
        code,
        redirectUri: 'http://localhost:3438/oauth/callback',
        codeVerifier: verifier,
        clientId: 'klijent-abc',
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('refuses a code redeemed by another client', async () => {
    const { store } = fakeStore()
    const code = await issueAuthorizationCode(store, base())
    await expect(
      exchangeAuthorizationCode(store, {
        code,
        redirectUri: REDIRECT,
        codeVerifier: verifier,
        clientId: 'netko-drugi',
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('refuses a code whose challenge method is not S256', async () => {
    const { store } = fakeStore()
    const code = await issueAuthorizationCode(store, {
      ...base(),
      codeChallengeMethod: 'plain',
      codeChallenge: verifier,
    })
    await expect(
      exchangeAuthorizationCode(store, {
        code,
        redirectUri: REDIRECT,
        codeVerifier: verifier,
        clientId: 'klijent-abc',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('refuses a code nobody issued', async () => {
    const { store } = fakeStore()
    await expect(
      exchangeAuthorizationCode(store, {
        code: 'izmisljeno',
        redirectUri: REDIRECT,
        codeVerifier: verifier,
        clientId: 'klijent-abc',
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })
})

describe('verifyAccessToken', () => {
  const verifier = 'verifier-for-the-token-tests'
  async function issued(now = () => 1_000_000) {
    const { store } = fakeStore()
    const code = await issueAuthorizationCode(
      store,
      {
        clientId: 'klijent-abc',
        userId: '7',
        redirectUri: REDIRECT,
        codeChallenge: challengeFor(verifier),
        codeChallengeMethod: 'S256',
        scope: 'mcp',
        resource: 'https://moreska.eu/api/mcp/mcp',
      },
      now,
    )
    const res = await exchangeAuthorizationCode(
      store,
      { code, redirectUri: REDIRECT, codeVerifier: verifier, clientId: 'klijent-abc' },
      now,
    )
    return { store, token: res.access_token }
  }

  it('resolves a live token to its user', async () => {
    const { store, token } = await issued()
    const verified = await verifyAccessToken(store, token, () => 1_000_000)
    expect(verified?.userId).toBe('7')
    expect(verified?.clientId).toBe('klijent-abc')
    expect(verified?.scopes).toEqual(['mcp'])
    expect(verified?.resource).toBe('https://moreska.eu/api/mcp/mcp')
  })

  it('reports the expiry in SECONDS, which is what AuthInfo wants', async () => {
    const t0 = 1_000_000
    const { store, token } = await issued(() => t0)
    const verified = await verifyAccessToken(store, token, () => t0)
    expect(verified?.expiresAt).toBe(Math.floor((t0 + ACCESS_TTL_MS) / 1000))
  })

  it('refuses an unknown token', async () => {
    const { store } = await issued()
    expect(await verifyAccessToken(store, 'nikad-izdan')).toBeUndefined()
  })

  it('refuses a token past its year', async () => {
    const t0 = 1_000_000
    const { store, token } = await issued(() => t0)
    expect(await verifyAccessToken(store, token, () => t0 + ACCESS_TTL_MS + 1)).toBeUndefined()
  })

  it('refuses a revoked token, revocation being the row going away', async () => {
    const { store, token } = await issued()
    // What `DELETE FROM oauth_tokens WHERE user_id = …` does to the store.
    const emptied: OAuthStore = { ...store, findToken: async () => null }
    expect(await verifyAccessToken(emptied, token)).toBeUndefined()
  })
})
