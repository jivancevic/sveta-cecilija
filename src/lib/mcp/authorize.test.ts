import { beforeEach, describe, expect, it } from 'vitest'
import { callbackUrl, handleConsent, parseAuthorizeRequest } from './authorize'
import type { AppRequestMeta } from '@/lib/app/request-guard'

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

const VALID = {
  response_type: 'code',
  client_id: 'klijent-abc',
  redirect_uri: REDIRECT,
  state: 'drzava',
  code_challenge: 'izazov',
  code_challenge_method: 'S256',
  scope: 'mcp',
}

const SAME_ORIGIN: AppRequestMeta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

beforeEach(() => {
  process.env.MCP_CLIENT_ID = 'klijent-abc'
  process.env.MCP_REDIRECT_URIS = REDIRECT
})

describe('parseAuthorizeRequest', () => {
  it('accepts a well-formed request', () => {
    expect(parseAuthorizeRequest(VALID)).toMatchObject({
      clientId: 'klijent-abc',
      redirectUri: REDIRECT,
      state: 'drzava',
      codeChallengeMethod: 'S256',
      scope: 'mcp',
    })
  })

  it('reads an absent response_type as code, the only one advertised', () => {
    const rest: Record<string, unknown> = { ...VALID }
    delete rest.response_type
    expect(parseAuthorizeRequest(rest)).not.toBeNull()
  })

  it('refuses another client, an unlisted redirect and a non-S256 challenge', () => {
    expect(parseAuthorizeRequest({ ...VALID, client_id: 'netko' })).toBeNull()
    expect(parseAuthorizeRequest({ ...VALID, redirect_uri: 'https://evil.example/cb' })).toBeNull()
    expect(parseAuthorizeRequest({ ...VALID, code_challenge_method: 'plain' })).toBeNull()
    expect(parseAuthorizeRequest({ ...VALID, code_challenge: '' })).toBeNull()
    expect(parseAuthorizeRequest({ ...VALID, response_type: 'token' })).toBeNull()
  })

  it('refuses a request naming a different resource (RFC 8707 invalid_target, #445 review)', () => {
    const ours = 'https://moreska.eu/api/mcp/mcp'
    expect(parseAuthorizeRequest({ ...VALID, resource: ours }, ours)).not.toBeNull()
    expect(parseAuthorizeRequest({ ...VALID, resource: 'https://evil.example/mcp' }, ours)).toBeNull()
    // A client that names none is fine: the code is bound to ours anyway.
    expect(parseAuthorizeRequest(VALID, ours)?.resource).toBeNull()
  })

  it('takes the first value when a parameter arrives twice', () => {
    expect(parseAuthorizeRequest({ ...VALID, state: ['prvi', 'drugi'] })?.state).toBe('prvi')
  })
})

describe('callbackUrl', () => {
  it('carries the state and the code back', () => {
    const request = parseAuthorizeRequest(VALID)!
    const url = new URL(callbackUrl(request, { code: 'abc' }))
    expect(url.origin + url.pathname).toBe(REDIRECT)
    expect(url.searchParams.get('code')).toBe('abc')
    expect(url.searchParams.get('state')).toBe('drzava')
  })

  it('carries an error instead, with no code', () => {
    const request = parseAuthorizeRequest(VALID)!
    const url = new URL(callbackUrl(request, { error: 'access_denied' }))
    expect(url.searchParams.get('error')).toBe('access_denied')
    expect(url.searchParams.has('code')).toBe(false)
  })
})

describe('handleConsent', () => {
  function deps(over: Partial<Parameters<typeof handleConsent>[1]> = {}) {
    const issued: unknown[] = []
    const base = {
      request: SAME_ORIGIN,
      userId: '7',
      isVoditelj: true,
      issueCode: async (params: unknown) => {
        issued.push(params)
        return 'kod-123'
      },
      resourceUrl: 'https://moreska.eu/api/mcp/mcp',
      ...over,
    }
    return { deps: base, issued }
  }

  it('issues a code for a voditelj who allows', async () => {
    const { deps: d, issued } = deps()
    const res = await handleConsent({ ...VALID, decision: 'allow' }, d)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ redirect: expect.stringContaining('code=kod-123') })
    expect(issued[0]).toMatchObject({ userId: '7', scope: 'mcp', clientId: 'klijent-abc' })
  })

  it('always binds the code to our own resource', async () => {
    const { deps: d, issued } = deps()
    await handleConsent({ ...VALID, decision: 'allow' }, d)
    expect(issued[0]).toMatchObject({ resource: 'https://moreska.eu/api/mcp/mcp' })
  })

  it('refuses a consent naming a different resource, and issues nothing', async () => {
    const { deps: d, issued } = deps()
    const res = await handleConsent(
      { ...VALID, resource: 'https://evil.example/mcp', decision: 'allow' },
      d,
    )
    expect(res.status).toBe(400)
    expect(issued).toEqual([])
  })

  it('sends access_denied back to the client on Odbij, and issues nothing', async () => {
    const { deps: d, issued } = deps()
    const res = await handleConsent({ ...VALID, decision: 'deny' }, d)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ redirect: expect.stringContaining('error=access_denied') })
    expect(issued).toEqual([])
  })

  it('treats an absent decision as a refusal, never as consent', async () => {
    const { deps: d, issued } = deps()
    const res = await handleConsent({ ...VALID }, d)
    expect(res.body).toMatchObject({ redirect: expect.stringContaining('error=access_denied') })
    expect(issued).toEqual([])
  })

  it('refuses a dancer with 403 (story 58) and an anonymous caller with 401', async () => {
    const { deps: notVoditelj, issued } = deps({ isVoditelj: false })
    expect(await handleConsent({ ...VALID, decision: 'allow' }, notVoditelj)).toMatchObject({
      status: 403,
    })
    const { deps: anonymous } = deps({ userId: null })
    const anon = await handleConsent({ ...VALID, decision: 'allow' }, anonymous)
    expect(anon).toMatchObject({ status: 401 })
    // Two situations, two sentences (#445 review): "sign in" is actionable,
    // "this account may not" is not.
    const denied = await handleConsent({ ...VALID, decision: 'allow' }, notVoditelj)
    expect((anon.body as { error: string }).error).not.toBe(
      (denied.body as { error: string }).error,
    )
    expect(issued).toEqual([])
  })

  it('re-validates the request rather than trusting the form it rendered', async () => {
    const { deps: d, issued } = deps()
    const res = await handleConsent(
      { ...VALID, redirect_uri: 'https://evil.example/cb', decision: 'allow' },
      d,
    )
    expect(res.status).toBe(400)
    expect(issued).toEqual([])
  })

  it('runs the /app cross-site guard first', async () => {
    const { deps: d, issued } = deps({
      request: { ...SAME_ORIGIN, secFetchSite: 'cross-site' },
    })
    expect(await handleConsent({ ...VALID, decision: 'allow' }, d)).toMatchObject({ status: 403 })
    const { deps: form } = deps({
      request: { ...SAME_ORIGIN, contentType: 'application/x-www-form-urlencoded' },
    })
    expect(await handleConsent({ ...VALID, decision: 'allow' }, form)).toMatchObject({ status: 415 })
    expect(issued).toEqual([])
  })
})
