import { describe, it, expect, beforeEach, vi } from 'vitest'

// #457 review — the route's own gate and the cookie it emits, in the shape the
// other route tests use: `payload.auth` is stubbed, so what is exercised here is
// exactly what the ROUTE decides. The cookie attributes are the point of the
// route existing at all (a `document.cookie` write would be capped at seven days
// by Safari's ITP), so they are asserted one by one rather than as a blob.

const auth = vi.fn()

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ auth })) }))
vi.mock('@payload-config', () => ({ default: {} }))

import { POST } from './route'

function post(headers: Record<string, string> = {}, url = 'http://localhost/api/app/onboarding/done') {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function signIn(permissions: readonly string[] | null) {
  if (permissions === null) auth.mockResolvedValue({ user: null })
  else auth.mockResolvedValue({ user: { id: 1, permissions: [...permissions] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.NEXT_PUBLIC_BASE_URL
})

describe('POST /api/app/onboarding/done', () => {
  it('refuses a cross-site POST before it looks at the session', async () => {
    signIn(['moreskant'])
    const res = await POST(post({ 'sec-fetch-site': 'cross-site' }))
    expect(res.status).toBe(403)
    expect(auth).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('refuses a foreign Origin', async () => {
    signIn(['moreskant'])
    const res = await POST(post({ origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('refuses a body that is not JSON', async () => {
    signIn(['moreskant'])
    const res = await POST(post({ 'content-type': 'text/plain' }))
    expect(res.status).toBe(415)
  })

  it('401s an anonymous caller, and sets no cookie', async () => {
    signIn(null)
    const res = await POST(post())
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('403s a login with no /app to be welcomed to', async () => {
    signIn(['tickets', 'door'])
    const res = await POST(post())
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('remembers the device for a dancer: 204 and the cookie', async () => {
    signIn(['moreskant'])
    const res = await POST(post())

    expect(res.status).toBe(204)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('moreskant_onboarded=1')
    expect(cookie).toContain('Path=/app')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Max-Age=31536000')
  })

  it('does the same for a voditelj replaying it', async () => {
    signIn(['moreska'])
    expect((await POST(post())).status).toBe(204)
  })

  it('leaves Secure off on plain http and sets it behind the https proxy', async () => {
    signIn(['moreskant'])
    expect(((await POST(post())).headers.get('set-cookie') ?? '')).not.toContain('Secure')

    const proxied = await POST(
      post({
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'moreska.eu',
        origin: 'https://moreska.eu',
      }),
    )
    expect(proxied.headers.get('set-cookie')).toContain('; Secure')
  })
})
