import { describe, it, expect, beforeEach } from 'vitest'
import { signTicketLink, verifyTicketLink } from './ticket-link'

beforeEach(() => {
  process.env.TICKET_LINK_SECRET = 'test-secret-32-bytes-long-1234567890ab'
})

describe('ticket-link', () => {
  it('verifies a freshly signed link', () => {
    const t = signTicketLink({ orderId: '42', email: 'a@b.co' })
    expect(verifyTicketLink(t, '42', 'a@b.co')).toEqual({ ok: true })
  })

  it('is case-insensitive on email', () => {
    const t = signTicketLink({ orderId: 42, email: 'A@B.CO' })
    expect(verifyTicketLink(t, 42, 'a@b.co').ok).toBe(true)
  })

  it('rejects a different orderId', () => {
    const t = signTicketLink({ orderId: '42', email: 'a@b.co' })
    expect(verifyTicketLink(t, '43', 'a@b.co')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a different email', () => {
    const t = signTicketLink({ orderId: '42', email: 'a@b.co' })
    expect(verifyTicketLink(t, '42', 'evil@x.co')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects an expired link', () => {
    const t = signTicketLink({ orderId: '42', email: 'a@b.co', ttlDays: -1 })
    expect(verifyTicketLink(t, '42', 'a@b.co')).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects malformed input', () => {
    expect(verifyTicketLink('not-a-token', '42', 'a@b.co').ok).toBe(false)
    expect(verifyTicketLink('', '42', 'a@b.co').ok).toBe(false)
  })

  it('rejects when secret rotates', () => {
    const t = signTicketLink({ orderId: '42', email: 'a@b.co' })
    process.env.TICKET_LINK_SECRET = 'a-different-secret-now-1234567890abcdef'
    expect(verifyTicketLink(t, '42', 'a@b.co')).toEqual({ ok: false, reason: 'invalid' })
  })
})
