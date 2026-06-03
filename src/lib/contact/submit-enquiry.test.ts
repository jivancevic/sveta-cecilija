import { describe, it, expect, vi } from 'vitest'
import { submitEnquiry } from './submit-enquiry'

const valid = { name: 'Ana Horvat', email: 'ana@example.com', message: 'Hello there', enquiry: 'General' }

describe('submitEnquiry', () => {
  it('persists a valid submission and reports ok', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const res = await submitEnquiry(valid, { persist })
    expect(res).toEqual({ ok: true })
    expect(persist).toHaveBeenCalledOnce()
    expect(persist.mock.calls[0][0]).toEqual({
      name: 'Ana Horvat',
      email: 'ana@example.com',
      message: 'Hello there',
      enquiryType: 'general',
    })
  })

  it('lowercases the email and trims all fields before persisting', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    await submitEnquiry(
      { name: '  Ana  ', email: '  Ana@Example.COM ', message: '  hi  ', enquiry: 'private-moreska' },
      { persist },
    )
    expect(persist.mock.calls[0][0]).toEqual({
      name: 'Ana',
      email: 'ana@example.com',
      message: 'hi',
      enquiryType: 'private-moreska',
    })
  })

  it.each([
    ['blank name', { ...valid, name: '   ' }, /name/i],
    ['missing email', { ...valid, email: '' }, /email/i],
    ['malformed email', { ...valid, email: 'not-an-email' }, /email/i],
    ['blank message', { ...valid, message: '  ' }, /message/i],
  ])('rejects %s without persisting', async (_label, input, errRe) => {
    const persist = vi.fn()
    const res = await submitEnquiry(input, { persist })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(errRe)
    expect(persist).not.toHaveBeenCalled()
  })

  it('returns an error (not a false success) when persistence fails', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('db down'))
    const notify = vi.fn()
    const res = await submitEnquiry(valid, { persist, notify })
    expect(res.ok).toBe(false)
    // Notification must not fire for an unsaved enquiry.
    expect(notify).not.toHaveBeenCalled()
  })

  it('fires the notification after a successful persist', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const notify = vi.fn().mockResolvedValue(undefined)
    await submitEnquiry(valid, { persist, notify })
    expect(notify).toHaveBeenCalledOnce()
    expect(notify.mock.calls[0][0].enquiryType).toBe('general')
  })

  it('still reports ok when the best-effort notification throws', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const notify = vi.fn().mockRejectedValue(new Error('brevo 401'))
    const res = await submitEnquiry(valid, { persist, notify })
    expect(res).toEqual({ ok: true })
  })
})
