import { describe, it, expect } from 'vitest'
import {
  emailRequiredForRole,
  assertUserEmailPolicy,
  UserEmailRequiredError,
} from './user-email-policy'

describe('emailRequiredForRole', () => {
  it('requires email for the human tiers', () => {
    expect(emailRequiredForRole('superadmin')).toBe(true)
    expect(emailRequiredForRole('admin')).toBe(true)
  })
  it('does not require email for shared/external roles', () => {
    expect(emailRequiredForRole('tehnika')).toBe(false)
    expect(emailRequiredForRole('partner')).toBe(false)
  })
  it('does not require email for an unknown/empty role', () => {
    expect(emailRequiredForRole(undefined)).toBe(false)
    expect(emailRequiredForRole(null)).toBe(false)
    expect(emailRequiredForRole('')).toBe(false)
  })
})

describe('assertUserEmailPolicy', () => {
  it('rejects a superadmin/admin with no email', () => {
    expect(() => assertUserEmailPolicy({ role: 'superadmin', email: null })).toThrow(UserEmailRequiredError)
    expect(() => assertUserEmailPolicy({ role: 'admin', email: '' })).toThrow(UserEmailRequiredError)
    expect(() => assertUserEmailPolicy({ role: 'admin', email: '   ' })).toThrow(/email address is required/i)
  })
  it('accepts a superadmin/admin with an email', () => {
    expect(() => assertUserEmailPolicy({ role: 'admin', email: 'a@b.co' })).not.toThrow()
  })
  it('accepts a tehnika/partner with no email (username-only)', () => {
    expect(() => assertUserEmailPolicy({ role: 'tehnika', email: null })).not.toThrow()
    expect(() => assertUserEmailPolicy({ role: 'partner', email: undefined })).not.toThrow()
  })
})
