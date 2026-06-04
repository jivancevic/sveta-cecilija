import { describe, it, expect } from 'vitest'
import {
  defaultLanguageForRole,
  normalizeAdminLang,
  resolveAdminLang,
  seedAdminLangCookie,
  dashboardStrings,
  adminT,
  ADMIN_LANGS,
} from './admin-i18n'

describe('defaultLanguageForRole', () => {
  it('defaults the secretary (admin) to Croatian', () => {
    expect(defaultLanguageForRole('admin')).toBe('hr')
  })

  it('defaults the door account (tehnika) to English', () => {
    expect(defaultLanguageForRole('tehnika')).toBe('en')
  })

  it('defaults a partner login to Croatian', () => {
    expect(defaultLanguageForRole('partner')).toBe('hr')
  })

  it('defaults the developer (superadmin) to English', () => {
    expect(defaultLanguageForRole('superadmin')).toBe('en')
  })

  it('falls back to Croatian for an unknown or missing role', () => {
    expect(defaultLanguageForRole(undefined)).toBe('hr')
    expect(defaultLanguageForRole(null)).toBe('hr')
    expect(defaultLanguageForRole('something-else')).toBe('hr')
  })
})

describe('normalizeAdminLang', () => {
  it('passes through supported languages', () => {
    expect(normalizeAdminLang('en')).toBe('en')
    expect(normalizeAdminLang('hr')).toBe('hr')
  })

  it('rejects unsupported or empty values', () => {
    expect(normalizeAdminLang('de')).toBeNull()
    expect(normalizeAdminLang('')).toBeNull()
    expect(normalizeAdminLang(undefined)).toBeNull()
    expect(normalizeAdminLang(null)).toBeNull()
  })
})

describe('resolveAdminLang', () => {
  it('lets an explicit saved choice win over the role default', () => {
    // superadmin's role default is English, but the saved cookie says Croatian
    expect(resolveAdminLang({ cookieLang: 'hr', role: 'superadmin' })).toBe('hr')
    // admin's role default is Croatian, but the saved cookie says English
    expect(resolveAdminLang({ cookieLang: 'en', role: 'admin' })).toBe('en')
  })

  it('falls back to the role default when no choice is saved', () => {
    expect(resolveAdminLang({ cookieLang: null, role: 'admin' })).toBe('hr')
    expect(resolveAdminLang({ cookieLang: undefined, role: 'superadmin' })).toBe('en')
  })

  it('ignores an unsupported saved value and uses the role default', () => {
    expect(resolveAdminLang({ cookieLang: 'de', role: 'admin' })).toBe('hr')
  })
})

describe('seedAdminLangCookie', () => {
  it('seeds the role default when no cookie is set yet', () => {
    expect(seedAdminLangCookie({ existing: null, role: 'admin' })).toBe('hr')
    expect(seedAdminLangCookie({ existing: undefined, role: 'tehnika' })).toBe('en')
    expect(seedAdminLangCookie({ existing: null, role: 'superadmin' })).toBe('en')
  })

  it('leaves a valid saved choice untouched (saved choice wins)', () => {
    expect(seedAdminLangCookie({ existing: 'en', role: 'admin' })).toBeNull()
    expect(seedAdminLangCookie({ existing: 'hr', role: 'superadmin' })).toBeNull()
  })

  it('re-seeds when the existing cookie value is not a supported language', () => {
    expect(seedAdminLangCookie({ existing: 'de', role: 'admin' })).toBe('hr')
    expect(seedAdminLangCookie({ existing: '', role: 'superadmin' })).toBe('en')
  })
})

describe('adminT string-map lookup', () => {
  it('returns the Croatian copy for hr and English for en', () => {
    expect(adminT('hr', 'dashboard')).toBe(dashboardStrings.hr.dashboard)
    expect(adminT('en', 'dashboard')).toBe(dashboardStrings.en.dashboard)
    expect(adminT('hr', 'dashboard')).not.toBe(adminT('en', 'dashboard'))
  })

  it('keeps the en and hr maps structurally identical', () => {
    expect(Object.keys(dashboardStrings.hr).sort()).toEqual(Object.keys(dashboardStrings.en).sort())
  })

  it('falls back to the English copy when the key is absent in the target language', () => {
    // Probe the runtime guard: a key present in en but (hypothetically) not in hr
    // resolves to the English string rather than undefined.
    const partial = { en: { greeting: 'Hi' }, hr: {} } as unknown as typeof dashboardStrings
    expect(adminT('hr', 'greeting' as never, partial)).toBe('Hi')
  })

  it('exposes exactly the supported admin languages', () => {
    expect(ADMIN_LANGS).toEqual(['en', 'hr'])
  })
})
