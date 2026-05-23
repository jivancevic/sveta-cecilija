import { describe, it, expect } from 'vitest'
import { generateQrToken } from './qr-token'

describe('generateQrToken', () => {
  it('returns a non-empty string', () => {
    expect(generateQrToken()).toMatch(/.+/)
  })

  it('uses only URL-safe characters', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateQrToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('returns a token at least 22 chars (>=128 bits of entropy)', () => {
    expect(generateQrToken().length).toBeGreaterThanOrEqual(22)
  })

  it('returns a distinct value on each call', () => {
    const set = new Set<string>()
    for (let i = 0; i < 100; i++) set.add(generateQrToken())
    expect(set.size).toBe(100)
  })
})
