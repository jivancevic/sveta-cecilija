import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { sendMetaPurchase, META_CAPI_VERSION, type MetaPurchaseInput } from './capi'

function makeInput(overrides: Partial<MetaPurchaseInput> = {}): MetaPurchaseInput {
  return {
    pixelId: '1025939333278327',
    accessToken: 'EAAB-secret-token',
    eventId: 'order_42',
    value: 20,
    currency: 'EUR',
    email: 'Ana@Example.com ',
    orderId: 42,
    eventSourceUrl: 'https://moreska.eu',
    eventTime: 1700000000,
    ...overrides,
  }
}

function okFetch() {
  return vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
}

describe('sendMetaPurchase', () => {
  it('POSTs to the graph.facebook.com events endpoint with the pixel id + token', async () => {
    const fetch = okFetch()
    await sendMetaPurchase(makeInput(), { fetch })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(
      `https://graph.facebook.com/${META_CAPI_VERSION}/1025939333278327/events?access_token=EAAB-secret-token`,
    )
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/json')
  })

  it('sends a Purchase event with value, currency and order_id in custom_data', async () => {
    const fetch = okFetch()
    await sendMetaPurchase(makeInput(), { fetch })
    const sent = JSON.parse(fetch.mock.calls[0][1].body)
    expect(sent.data).toHaveLength(1)
    const evt = sent.data[0]
    expect(evt.event_name).toBe('Purchase')
    expect(evt.action_source).toBe('website')
    expect(evt.event_time).toBe(1700000000)
    expect(evt.custom_data).toEqual({ value: 20, currency: 'EUR', order_id: '42' })
  })

  it('carries the dedup event_id so it merges with the browser pixel event', async () => {
    const fetch = okFetch()
    await sendMetaPurchase(makeInput({ eventId: 'order_42' }), { fetch })
    const evt = JSON.parse(fetch.mock.calls[0][1].body).data[0]
    expect(evt.event_id).toBe('order_42')
  })

  it('hashes the email (SHA-256, lower-cased + trimmed) — never sends it raw', async () => {
    const fetch = okFetch()
    await sendMetaPurchase(makeInput({ email: 'Ana@Example.com ' }), { fetch })
    const evt = JSON.parse(fetch.mock.calls[0][1].body).data[0]
    const expected = createHash('sha256').update('ana@example.com').digest('hex')
    expect(evt.user_data.em).toEqual([expected])
    // raw email must not appear anywhere in the payload
    expect(fetch.mock.calls[0][1].body).not.toContain('Ana@Example.com')
    expect(fetch.mock.calls[0][1].body.toLowerCase()).not.toContain('ana@example.com')
  })

  it('omits user_data.em when no email is provided', async () => {
    const fetch = okFetch()
    await sendMetaPurchase(makeInput({ email: undefined }), { fetch })
    const evt = JSON.parse(fetch.mock.calls[0][1].body).data[0]
    expect(evt.user_data.em).toBeUndefined()
  })

  it('url-encodes the access token', async () => {
    const fetch = okFetch()
    await sendMetaPurchase(makeInput({ accessToken: 'a b/c+d' }), { fetch })
    expect(fetch.mock.calls[0][0]).toContain('access_token=a%20b%2Fc%2Bd')
  })

  it('throws with the status + body on a non-2xx response', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('{"error":{"message":"Bad token"}}', { status: 400 }))
    await expect(sendMetaPurchase(makeInput(), { fetch })).rejects.toThrow(/Meta CAPI 400.*Bad token/)
  })

  it('defaults event_time to now (seconds) when not injected', async () => {
    const fetch = okFetch()
    const before = Math.floor(Date.now() / 1000)
    await sendMetaPurchase(makeInput({ eventTime: undefined }), { fetch })
    const after = Math.floor(Date.now() / 1000)
    const evt = JSON.parse(fetch.mock.calls[0][1].body).data[0]
    expect(evt.event_time).toBeGreaterThanOrEqual(before)
    expect(evt.event_time).toBeLessThanOrEqual(after)
  })
})
