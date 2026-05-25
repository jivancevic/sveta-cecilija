import { describe, it, expect } from 'vitest'
import { resolveLocale } from './proxy'

describe('resolveLocale (cookieless / Accept-Language fallback)', () => {
  it('Googlebot (no cookie, no Accept-Language) resolves to en', () => {
    expect(resolveLocale({ cookie: undefined, acceptLanguage: null })).toBe('en')
  })

  it('EN browser (en-US,en;q=0.9) resolves to en', () => {
    expect(resolveLocale({ cookie: undefined, acceptLanguage: 'en-US,en;q=0.9' })).toBe('en')
  })

  it('HR browser (hr-HR,hr;q=0.9) resolves to hr — no SEO regression for real users', () => {
    expect(resolveLocale({ cookie: undefined, acceptLanguage: 'hr-HR,hr;q=0.9' })).toBe('hr')
  })

  it('Unsupported language (de-DE) falls back to en, not hr', () => {
    expect(resolveLocale({ cookie: undefined, acceptLanguage: 'de-DE,de;q=0.9' })).toBe('en')
  })

  it('Cookie wins over Accept-Language', () => {
    expect(resolveLocale({ cookie: 'hr', acceptLanguage: 'en-US' })).toBe('hr')
    expect(resolveLocale({ cookie: 'en', acceptLanguage: 'hr-HR' })).toBe('en')
  })

  it('Garbage cookie value is ignored, falls back to Accept-Language', () => {
    expect(resolveLocale({ cookie: 'xx', acceptLanguage: 'hr-HR' })).toBe('hr')
    expect(resolveLocale({ cookie: 'xx', acceptLanguage: null })).toBe('en')
  })
})
