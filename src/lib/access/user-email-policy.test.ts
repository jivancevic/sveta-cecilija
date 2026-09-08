import { describe, it, expect } from 'vitest'
import {
  emailRequiredFor,
  assertUserEmailPolicy,
  UserEmailRequiredError,
} from './user-email-policy'

describe('emailRequiredFor', () => {
  it('requires email for accounts a named person holds', () => {
    expect(emailRequiredFor({ permissions: ['users', 'tickets', 'dev'] })).toBe(true)
    expect(emailRequiredFor({ permissions: ['tickets', 'refunds', 'door'] })).toBe(true)
    expect(emailRequiredFor({ permissions: ['moreska'] })).toBe(true)
    // #420: a moreškant login is created by an invitation email, so the inbox
    // is the account's precondition, not a nicety.
    expect(emailRequiredFor({ permissions: ['moreskant'] })).toBe(true)
    expect(emailRequiredFor({ permissions: ['moreska', 'moreskant'] })).toBe(true)
  })

  it('does not require email for shared or external accounts', () => {
    expect(emailRequiredFor({ permissions: ['door'] })).toBe(false)
    expect(emailRequiredFor({ permissions: ['partner'] })).toBe(false)
    expect(emailRequiredFor({ permissions: ['season_stats'] })).toBe(false)
  })

  it('does not require email for an empty, missing or unknown set', () => {
    expect(emailRequiredFor({ permissions: [] })).toBe(false)
    expect(emailRequiredFor({})).toBe(false)
    expect(emailRequiredFor(null)).toBe(false)
    expect(emailRequiredFor({ permissions: ['admin'] })).toBe(false)
  })
})

describe('assertUserEmailPolicy', () => {
  it('rejects a person-tier account with no email', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['users'], email: null })).toThrow(
      UserEmailRequiredError,
    )
    expect(() => assertUserEmailPolicy({ permissions: ['tickets'], email: '' })).toThrow(
      UserEmailRequiredError,
    )
    expect(() => assertUserEmailPolicy({ permissions: ['moreska'], email: '   ' })).toThrow(
      /email address is required/i,
    )
    expect(() => assertUserEmailPolicy({ permissions: ['moreskant'], email: null })).toThrow(
      UserEmailRequiredError,
    )
  })

  it('accepts a person-tier account with an email', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['tickets'], email: 'a@b.co' })).not.toThrow()
  })

  it('accepts a door/partner/member account with no email (username-only)', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['door'], email: null })).not.toThrow()
    expect(() => assertUserEmailPolicy({ permissions: ['partner'], email: undefined })).not.toThrow()
    expect(() => assertUserEmailPolicy({ permissions: ['season_stats'] })).not.toThrow()
  })

  it('names the offending permissions in the message', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['tickets', 'door'] })).toThrow(/tickets/)
  })
})
