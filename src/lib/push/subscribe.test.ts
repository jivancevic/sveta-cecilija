import { describe, expect, it, vi } from 'vitest'
import type { AppRequestMeta } from '@/lib/app/request-guard'
import { handlePushSubscribe, handlePushUnsubscribe } from './subscribe'

// #431 — the two device routes through injected deps. 401 and 403-for-the-wrong
// permission are NOT modelled here: `requirePermission` answers those before the
// handler is reached, and its own tests cover them. What is modelled is the
// `/app` cross-site guard, the validation and the write.

const sameOrigin: AppRequestMeta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const crossSite: AppRequestMeta = { ...sameOrigin, secFetchSite: 'cross-site' }
const formPost: AppRequestMeta = { ...sameOrigin, contentType: 'application/x-www-form-urlencoded' }

const body = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'BPk...', auth: 'aXo...' },
}

function subscribeDeps(request: AppRequestMeta = sameOrigin) {
  return {
    request,
    userId: '31',
    userAgent: 'Mozilla/5.0 (iPhone)',
    saveSubscription: vi.fn(async () => {}),
  }
}

describe('handlePushSubscribe', () => {
  it('stores the device and answers 200', async () => {
    const deps = subscribeDeps()
    const result = await handlePushSubscribe(body, deps)

    expect(result.status).toBe(200)
    expect(deps.saveSubscription).toHaveBeenCalledWith({
      userId: '31',
      endpoint: body.endpoint,
      p256dh: 'BPk...',
      auth: 'aXo...',
      userAgent: 'Mozilla/5.0 (iPhone)',
    })
  })

  it('refuses a cross-site request with 403, before any write', async () => {
    const deps = subscribeDeps(crossSite)
    const result = await handlePushSubscribe(body, deps)

    expect(result.status).toBe(403)
    expect(deps.saveSubscription).not.toHaveBeenCalled()
  })

  it('refuses a non-JSON body with 415', async () => {
    const deps = subscribeDeps(formPost)
    expect((await handlePushSubscribe(body, deps)).status).toBe(415)
    expect(deps.saveSubscription).not.toHaveBeenCalled()
  })

  it.each([
    ['no endpoint', { keys: body.keys }],
    ['no p256dh', { endpoint: body.endpoint, keys: { auth: 'a' } }],
    ['no auth', { endpoint: body.endpoint, keys: { p256dh: 'p' } }],
    ['no keys at all', { endpoint: body.endpoint }],
    ['nothing', null],
  ])('400s on %s: a row without keys could never be encrypted to', async (_label, payload) => {
    const deps = subscribeDeps()
    const result = await handlePushSubscribe(payload as never, deps)

    expect(result.status).toBe(400)
    expect(deps.saveSubscription).not.toHaveBeenCalled()
  })

  it('stores a null user agent rather than an empty string', async () => {
    const deps = { ...subscribeDeps(), userAgent: '   ' }
    await handlePushSubscribe(body, deps)
    expect(deps.saveSubscription).toHaveBeenCalledWith(expect.objectContaining({ userAgent: null }))
  })
})

describe('handlePushUnsubscribe', () => {
  function deps(request: AppRequestMeta = sameOrigin, removed = 1) {
    return {
      request,
      userId: '31',
      removeSubscription: vi.fn(async () => removed),
    }
  }

  it('deletes the caller OWN row for that endpoint', async () => {
    const d = deps()
    const result = await handlePushUnsubscribe({ endpoint: body.endpoint }, d)

    expect(result.status).toBe(200)
    expect(d.removeSubscription).toHaveBeenCalledWith('31', body.endpoint)
  })

  it('is a 200 even when there was nothing to delete', async () => {
    const d = deps(sameOrigin, 0)
    const result = await handlePushUnsubscribe({ endpoint: body.endpoint }, d)

    // The device wanted to be off, and it is off.
    expect(result).toEqual({ status: 200, body: { ok: true, removed: 0 } })
  })

  it('refuses cross-site and non-JSON the same way subscribe does', async () => {
    expect((await handlePushUnsubscribe({ endpoint: 'x' }, deps(crossSite))).status).toBe(403)
    expect((await handlePushUnsubscribe({ endpoint: 'x' }, deps(formPost))).status).toBe(415)
  })

  it('400s without an endpoint', async () => {
    const d = deps()
    expect((await handlePushUnsubscribe({}, d)).status).toBe(400)
    expect(d.removeSubscription).not.toHaveBeenCalled()
  })
})
