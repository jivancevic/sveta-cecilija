import { describe, it, expect } from 'vitest'
import { signRescheduleRefundToken, verifyRescheduleRefundToken } from './reschedule-refund-token'

const SECRET = 'test-secret-do-not-use-in-prod'

describe('reschedule-refund-token', () => {
  it('round-trips an order id through sign/verify', () => {
    const token = signRescheduleRefundToken('123', SECRET)
    expect(verifyRescheduleRefundToken(token, SECRET)).toBe('123')
  })

  it('accepts a numeric order id (coerced to string)', () => {
    const token = signRescheduleRefundToken(456 as unknown as string, SECRET)
    expect(verifyRescheduleRefundToken(token, SECRET)).toBe('456')
  })

  it('rejects a token signed with a different secret', () => {
    const token = signRescheduleRefundToken('123', SECRET)
    expect(verifyRescheduleRefundToken(token, 'other-secret')).toBeNull()
  })

  it('rejects a tampered order-id part (re-pointing to another order)', () => {
    const token = signRescheduleRefundToken('123', SECRET)
    const [, sig] = token.split('.')
    const forged = `${Buffer.from('999').toString('base64url')}.${sig}`
    expect(verifyRescheduleRefundToken(forged, SECRET)).toBeNull()
  })

  it('rejects a tampered signature part', () => {
    const token = signRescheduleRefundToken('123', SECRET)
    const [id] = token.split('.')
    expect(verifyRescheduleRefundToken(`${id}.AAAA`, SECRET)).toBeNull()
  })

  it('rejects malformed tokens without throwing', () => {
    expect(verifyRescheduleRefundToken('', SECRET)).toBeNull()
    expect(verifyRescheduleRefundToken('nodot', SECRET)).toBeNull()
    expect(verifyRescheduleRefundToken('.onlydot', SECRET)).toBeNull()
    // @ts-expect-error intentional bad input
    expect(verifyRescheduleRefundToken(null, SECRET)).toBeNull()
  })
})
