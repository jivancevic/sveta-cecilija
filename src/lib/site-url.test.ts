import { afterEach, describe, expect, it } from 'vitest'
import { scanUrl, siteBaseUrl } from './site-url'

const ORIGINAL = process.env.NEXT_PUBLIC_BASE_URL

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_BASE_URL
  else process.env.NEXT_PUBLIC_BASE_URL = ORIGINAL
})

describe('siteBaseUrl', () => {
  it('uses NEXT_PUBLIC_BASE_URL so staging slips self-reference', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://dev.moreska.eu'
    expect(siteBaseUrl()).toBe('https://dev.moreska.eu')
  })

  it('strips a trailing slash', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://dev.moreska.eu/'
    expect(scanUrl('abc')).toBe('https://dev.moreska.eu/scan/abc')
  })

  it('falls back to prod when unset (printed artifact must not point at localhost)', () => {
    delete process.env.NEXT_PUBLIC_BASE_URL
    expect(siteBaseUrl()).toBe('https://moreska.eu')
  })
})
