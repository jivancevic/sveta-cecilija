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

  // #235 — the enquiry-notification failure is the first critical-events write
  // site. The previously-silent "email didn't deliver" cases must now be
  // recorded, without ever turning a stored enquiry into a failure.
  it('records a critical event when the notification send fails', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const notify = vi.fn().mockRejectedValue(new Error('brevo 401'))
    const recordEvent = vi.fn().mockResolvedValue(undefined)
    const res = await submitEnquiry(valid, { persist, notify, recordEvent })
    expect(res).toEqual({ ok: true })
    expect(recordEvent).toHaveBeenCalledOnce()
    const event = recordEvent.mock.calls[0][0]
    expect(event.kind).toBe('enquiry_notification_failed')
    expect(event.context.email).toBe('ana@example.com')
  })

  it('records a critical event when notification is skipped (no notifier wired)', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const recordEvent = vi.fn().mockResolvedValue(undefined)
    const res = await submitEnquiry(valid, { persist, recordEvent })
    expect(res).toEqual({ ok: true })
    expect(recordEvent).toHaveBeenCalledOnce()
    expect(recordEvent.mock.calls[0][0].kind).toBe('enquiry_notification_skipped')
  })

  it('records no critical event when the notification succeeds', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const notify = vi.fn().mockResolvedValue(undefined)
    const recordEvent = vi.fn().mockResolvedValue(undefined)
    const res = await submitEnquiry(valid, { persist, notify, recordEvent })
    expect(res).toEqual({ ok: true })
    expect(recordEvent).not.toHaveBeenCalled()
  })

  it('still reports ok when recording the critical event itself throws', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const notify = vi.fn().mockRejectedValue(new Error('brevo 401'))
    const recordEvent = vi.fn().mockRejectedValue(new Error('events table missing'))
    const res = await submitEnquiry(valid, { persist, notify, recordEvent })
    expect(res).toEqual({ ok: true })
  })
})
