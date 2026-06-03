import { describe, it, expect } from 'vitest'
import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token'

const SECRET = 'test-secret-do-not-use-in-prod'

describe('unsubscribe-token', () => {
  it('round-trips an email through sign/verify', () => {
    const token = signUnsubscribeToken('Ana@Example.com', SECRET)
    expect(verifyUnsubscribeToken(token, SECRET)).toBe('ana@example.com')
  })

  it('normalizes case so the opt-out key is stable', () => {
    const a = signUnsubscribeToken('ANA@example.com', SECRET)
    const b = signUnsubscribeToken('ana@example.com', SECRET)
    expect(a).toBe(b)
    expect(verifyUnsubscribeToken(a, SECRET)).toBe('ana@example.com')
  })

  it('rejects a token signed with a different secret', () => {
    const token = signUnsubscribeToken('ana@example.com', SECRET)
    expect(verifyUnsubscribeToken(token, 'other-secret')).toBeNull()
  })

  it('rejects a tampered email part', () => {
    const token = signUnsubscribeToken('ana@example.com', SECRET)
    const [, sig] = token.split('.')
    const forged = `${Buffer.from('mallory@example.com').toString('base64url')}.${sig}`
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull()
  })

  it('rejects a tampered signature part', () => {
    const token = signUnsubscribeToken('ana@example.com', SECRET)
    const [email] = token.split('.')
    expect(verifyUnsubscribeToken(`${email}.AAAA`, SECRET)).toBeNull()
  })

  it('rejects malformed tokens without throwing', () => {
    expect(verifyUnsubscribeToken('', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('nodot', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('.onlydot', SECRET)).toBeNull()
    // @ts-expect-error intentional bad input
    expect(verifyUnsubscribeToken(null, SECRET)).toBeNull()
  })
})
