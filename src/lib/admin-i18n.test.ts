import { describe, it, expect } from 'vitest'
import {
  defaultLanguageForUser,
  normalizeAdminLang,
  resolveAdminLang,
  seedAdminLangCookie,
  dashboardStrings,
  adminT,
  ADMIN_LANGS,
} from './admin-i18n'

const developer = { permissions: ['users', 'tickets', 'refunds', 'door', 'partner', 'season_stats', 'moreska', 'moreskant', 'dev'] }
const ticketAdmin = { permissions: ['tickets', 'refunds', 'door'] }
const doorAccount = { permissions: ['door'] }
const partnerAccount = { permissions: ['partner'] }
const memberAccount = { permissions: ['season_stats'] }

describe('defaultLanguageForUser', () => {
  it('defaults the secretary (tickets) to Croatian, even though she also scans', () => {
    expect(defaultLanguageForUser(ticketAdmin)).toBe('hr')
  })

  it('defaults a door-only account to English (the scan overlay faces the guest)', () => {
    expect(defaultLanguageForUser(doorAccount)).toBe('en')
  })

  it('defaults a partner login to Croatian', () => {
    expect(defaultLanguageForUser(partnerAccount)).toBe('hr')
  })

  it('defaults the shared society-membership login to Croatian (ADR-0022)', () => {
    expect(defaultLanguageForUser(memberAccount)).toBe('hr')
  })

  it('defaults a `dev` holder to English', () => {
    expect(defaultLanguageForUser(developer)).toBe('en')
    expect(defaultLanguageForUser({ permissions: ['dev'] })).toBe('en')
  })

  it('falls back to Croatian for an empty, missing or unknown set', () => {
    expect(defaultLanguageForUser({ permissions: [] })).toBe('hr')
    expect(defaultLanguageForUser(undefined)).toBe('hr')
    expect(defaultLanguageForUser(null)).toBe('hr')
    expect(defaultLanguageForUser({ permissions: ['something-else'] })).toBe('hr')
    expect(defaultLanguageForUser({ role: 'superadmin' } as never)).toBe('hr')
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
  it('lets an explicit saved choice win over the permission default', () => {
    // the developer's default is English, but the saved cookie says Croatian
    expect(resolveAdminLang({ cookieLang: 'hr', user: developer })).toBe('hr')
    // the secretary's default is Croatian, but the saved cookie says English
    expect(resolveAdminLang({ cookieLang: 'en', user: ticketAdmin })).toBe('en')
  })

  it('falls back to the permission default when no choice is saved', () => {
    expect(resolveAdminLang({ cookieLang: null, user: ticketAdmin })).toBe('hr')
    expect(resolveAdminLang({ cookieLang: undefined, user: developer })).toBe('en')
  })

  it('ignores an unsupported saved value and uses the permission default', () => {
    expect(resolveAdminLang({ cookieLang: 'de', user: ticketAdmin })).toBe('hr')
  })
})

describe('seedAdminLangCookie', () => {
  it('seeds the permission default when no cookie is set yet', () => {
    expect(seedAdminLangCookie({ existing: null, user: ticketAdmin })).toBe('hr')
    expect(seedAdminLangCookie({ existing: undefined, user: doorAccount })).toBe('en')
    expect(seedAdminLangCookie({ existing: null, user: developer })).toBe('en')
  })

  it('leaves a valid saved choice untouched (saved choice wins)', () => {
    expect(seedAdminLangCookie({ existing: 'en', user: ticketAdmin })).toBeNull()
    expect(seedAdminLangCookie({ existing: 'hr', user: developer })).toBeNull()
  })

  it('re-seeds when the existing cookie value is not a supported language', () => {
    expect(seedAdminLangCookie({ existing: 'de', user: ticketAdmin })).toBe('hr')
    expect(seedAdminLangCookie({ existing: '', user: developer })).toBe('en')
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
